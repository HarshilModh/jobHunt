#!/usr/bin/env node
/**
 * scan.mjs — board scanner (zero tokens, pure HTTP + JSON).
 *
 * Reads companies from config.yml, hits their ATS APIs directly, applies the
 * title + location filters, dedups against data/scan-history.tsv + pipeline.md,
 * and appends new openings to data/pipeline.md.
 *
 * Providers are detected from each company's careers_url:
 *   greenhouse  https://job-boards.greenhouse.io/<slug>
 *   ashby       https://jobs.ashbyhq.com/<slug>
 *   lever       https://jobs.lever.co/<slug>
 *   workable    https://apply.workable.com/<slug>
 *   workday     https://<tenant>.wd<N>.myworkdayjobs.com/<site>
 *
 * Usage:
 *   node scan.mjs                 # scan all enabled companies
 *   node scan.mjs --dry-run       # preview, write nothing
 *   node scan.mjs --company nvidia # one company (substring match)
 */

import { readFileSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { buildLocationFilter, buildTitleFilter, persistBoardOffers } from './board-store.mjs';

const CONFIG_PATH = 'config.yml';
const CONCURRENCY = 10;

mkdirSync('data', { recursive: true });

// ── HTTP helper ─────────────────────────────────────────────────────

async function http(url, { timeoutMs = 10000, method = 'GET', headers = {}, body = null, redirect = 'follow' } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method, body, redirect, signal: ctrl.signal,
      headers: { 'user-agent': 'jobhunt/1.0', ...headers },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}
const fetchJson = (url, opts) => http(url, opts).then((r) => r.json());
const fetchText = (url, opts) => http(url, opts).then((r) => r.text());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const decode = (s) => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const stripHtml = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ── Providers (detect from careers_url → fetch normalized jobs) ──────

const GREENHOUSE_HOSTS = new Set([
  'boards-api.greenhouse.io', 'boards.greenhouse.io',
  'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
]);

const providers = [
  {
    id: 'greenhouse',
    detect(url) {
      const m = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/);
      return m ? `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs?content=true` : null;
    },
    async fetch(api, name) {
      const host = new URL(api).hostname;
      if (!GREENHOUSE_HOSTS.has(host)) throw new Error(`greenhouse: untrusted host ${host}`);
      const json = await fetchJson(api, { redirect: 'error' });
      return (json?.jobs || []).filter((j) => j.absolute_url).map((j) => ({
        title: j.title || '', url: j.absolute_url, company: name, location: j.location?.name || '',
        description: stripHtml(j.content || ''), postedAt: j.first_published || null,
        postedPrecision: j.first_published ? 'timestamp' : 'unknown',
      }));
    },
  },
  {
    id: 'ashby',
    // Ashby's public API has a ~10s latency floor + rate-limits — long timeout + backoff retry.
    detect(url) {
      const m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/);
      return m ? `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true` : null;
    },
    async fetch(api, name) {
      let lastErr;
      for (let attempt = 0; attempt <= 2; attempt++) {
        if (attempt > 0) await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 500));
        try {
          const json = await fetchJson(api, { timeoutMs: 30000 });
          return (json?.jobs || []).map((j) => ({
            title: j.title || '', url: j.jobUrl || '', company: name, location: j.location || '',
            description: stripHtml(j.descriptionHtml || j.description || ''),
            compensation: j.compensation?.compensationTierSummary || null,
            postedAt: j.publishedAt || null, postedPrecision: j.publishedAt ? 'timestamp' : 'unknown',
          }));
        } catch (e) { lastErr = e; }
      }
      throw lastErr;
    },
  },
  {
    id: 'lever',
    detect(url) {
      const m = url.match(/jobs\.lever\.co\/([^/?#]+)/);
      return m ? `https://api.lever.co/v0/postings/${m[1]}` : null;
    },
    async fetch(api, name) {
      const json = await fetchJson(api);
      if (!Array.isArray(json)) return [];
      return json.map((j) => ({
        title: j.text || '', url: j.hostedUrl || '', company: name, location: j.categories?.location || '',
        description: stripHtml(j.descriptionPlain || ''), postedAt: j.createdAt || null,
        postedPrecision: j.createdAt ? 'timestamp' : 'unknown',
      }));
    },
  },
  {
    id: 'workable',
    detect(url) {
      const m = url.match(/^https:\/\/apply\.workable\.com\/([^/?#]+)/);
      return m ? `https://apply.workable.com/${m[1]}/jobs.md` : null;
    },
    async fetch(api, name) {
      const text = await fetchText(api, { redirect: 'error' });
      const jobs = [];
      for (const line of text.split('\n')) {
        if (!line.startsWith('|') || !line.includes('[View]')) continue;
        const cols = line.split('|').map((c) => c.trim());
        if (cols.length < 8 || !cols[1] || cols[1] === 'Title') continue;
        const m = line.match(/\[View\]\(([^)]+)\)/);
        let url = m ? m[1].replace(/\.md$/, '') : '';
        try {
          const p = new URL(url);
          if (p.protocol !== 'https:' || p.hostname !== 'apply.workable.com') continue;
          url = p.href;
        } catch { continue; }
        jobs.push({ title: cols[1], url, company: name, location: cols[3] || '' });
      }
      return jobs;
    },
  },
  {
    id: 'workday',
    // Workday boards are huge — run targeted entry-level searches via the public CXS POST API.
    detect(url) {
      const m = url.match(/^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/);
      if (!m || m[3] === 'wday') return null;
      return JSON.stringify({ tenant: m[1], wd: m[2], site: m[3] });
    },
    async fetch(api, name, entry) {
      const { tenant, wd, site } = JSON.parse(api);
      const host = `${tenant}.${wd}.myworkdayjobs.com`;
      const cxs = `https://${host}/wday/cxs/${tenant}/${site}/jobs`;
      const post = (body) => fetchJson(cxs, {
        method: 'POST', timeoutMs: 20000,
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      });
      // Multi-location postings return locationsText like "2 Locations", which the
      // location filter can't see through (India roles were leaking into the top
      // list). Restrict server-side to US via the tenant's country facet — the
      // facet parameter NAME varies per tenant, so discover it with a probe.
      let usFacets = {};
      try {
        const probe = await post({ appliedFacets: {}, limit: 1, offset: 0, searchText: '' });
        outer: for (const f of probe?.facets || [])
          for (const v of f?.values || [])
            if (f.facetParameter && /^united states/i.test(v?.descriptor || '')) {
              usFacets = { [f.facetParameter]: [v.id] };
              break outer;
            }
      } catch { /* no country facet — scan unrestricted */ }
      const terms = entry.search_terms?.length ? entry.search_terms
        : ['software engineer new grad', 'software engineer intern', 'software engineer early career'];
      const maxResults = Number.isFinite(entry.max_results) ? entry.max_results : 100;
      const seen = new Set();
      const jobs = [];
      for (const term of terms) {
        let offset = 0, total = Infinity;
        while (offset < Math.min(total, maxResults)) {
          const json = await post({ appliedFacets: usFacets, limit: 20, offset, searchText: term });
          total = Number(json?.total) || 0;
          const page = json?.jobPostings || [];
          if (!page.length) break;
          for (const jp of page) {
            if (!jp?.externalPath || seen.has(jp.externalPath)) continue;
            seen.add(jp.externalPath);
            jobs.push({
              title: (jp.title || '').trim(), url: `https://${host}/en-US/${site}${jp.externalPath}`,
              company: name, location: (jp.locationsText || '').trim(), postedRaw: jp.postedOn || '',
              postedPrecision: jp.postedOn ? 'relative-day' : 'unknown',
            });
          }
          offset += 20;
        }
      }
      return jobs.filter((j) => j.title && j.url);
    },
  },
  {
    id: 'amazonjobs',
    // Amazon's public search.json — run targeted new-grad/intern searches (like Workday).
    detect(url) {
      return /(?:^|\/\/)(?:www\.)?amazon\.jobs\b/.test(url) ? 'amazon' : null;
    },
    async fetch(_api, name, entry) {
      const terms = entry.search_terms?.length ? entry.search_terms
        : ['software development engineer 2026', 'software development engineer new grad',
           'software dev engineer university graduate', 'software development engineer intern'];
      const maxResults = Number.isFinite(entry.max_results) ? entry.max_results : 100;
      const seen = new Set();
      const jobs = [];
      for (const term of terms) {
        let offset = 0, total = Infinity;
        while (offset < Math.min(total, maxResults)) {
          const u = new URL('https://www.amazon.jobs/en/search.json');
          u.searchParams.set('base_query', term);
          u.searchParams.append('normalized_country_code[]', 'USA');
          u.searchParams.set('result_limit', '100');
          u.searchParams.set('offset', String(offset));
          u.searchParams.set('sort', 'recent');
          const json = await fetchJson(u.href, { timeoutMs: 20000 });
          total = Number(json?.hits) || 0;
          const page = json?.jobs || [];
          if (!page.length) break;
          for (const jp of page) {
            const key = jp?.id_icims || jp?.job_path;
            if (!jp?.job_path || seen.has(key)) continue;
            seen.add(key);
            jobs.push({
              title: (jp.title || '').trim(),
              url: `https://www.amazon.jobs${jp.job_path}`,
              company: name,
              location: jp.normalized_location || jp.location || '',
              description: stripHtml(jp.description || ''),
              postedAt: jp.posted_date || jp.updated_at || null,
              postedPrecision: jp.posted_date || jp.updated_at ? 'date' : 'unknown',
            });
          }
          offset += 100;
        }
      }
      return jobs.filter((j) => j.title && j.url);
    },
  },
];

function resolveProvider(entry) {
  const url = entry.careers_url || '';
  for (const p of providers) {
    const api = p.detect(url);
    if (api) return { provider: p, api };
  }
  return null;
}

async function parallel(tasks, limit) {
  let i = 0;
  const worker = async () => { while (i < tasks.length) await tasks[i++](); };
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const ci = args.indexOf('--company');
  const filter = ci !== -1 ? args[ci + 1]?.toLowerCase() : null;

  const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
  const titleOk = buildTitleFilter(config.title_filter);
  const locOk = buildLocationFilter(config.location_filter);

  const targets = [];
  for (const c of config.companies || []) {
    if (!c?.name || c.enabled === false) continue;
    if (filter && !c.name.toLowerCase().includes(filter)) continue;
    const r = resolveProvider(c);
    if (r) targets.push({ ...c, _p: r });
  }

  console.log(`Scanning ${targets.length} companies…${dryRun ? ' (dry run)' : ''}\n`);

  const observedAt = new Date().toISOString();
  let found = 0, fTitle = 0, fLoc = 0, dupes = 0;
  const newOffers = [];
  const errors = [];
  const emptyBoards = [];

  const tasks = targets.map((c) => async () => {
    try {
      const jobs = await c._p.provider.fetch(c._p.api, c.name, c);
      // A board that moved returns HTTP 200 with an empty list, which is
      // otherwise indistinguishable from a board with nothing open — that is
      // how two tier-1 companies sat dead in the config without a single
      // error. Zero postings is worth a look even though it is not an error.
      if (!jobs.length) emptyBoards.push(`${c.name} (${c._p.provider.id})`);
      found += jobs.length;
      for (const j of jobs) {
        if (!titleOk(j.title)) { fTitle++; continue; }
        if (!locOk(j.location)) { fLoc++; continue; }
        newOffers.push({ ...j, source: `${c._p.provider.id}-api` });
      }
    } catch (e) { errors.push({ company: c.name, error: e.message }); }
  });
  await parallel(tasks, CONCURRENCY);

  const persisted = await persistBoardOffers(newOffers, {
    lane: 'ats',
    blocklist: config.company_blocklist || [],
    staffing: config.staffing_agencies || [],
    dryRun,
    observedAt,
  });
  dupes = persisted.duplicateCount;
  const addedOffers = persisted.added;

  console.log('━'.repeat(45));
  console.log(`Companies scanned:    ${targets.length}`);
  console.log(`Total jobs found:     ${found}`);
  console.log(`Filtered by title:    ${fTitle}`);
  console.log(`Filtered by location: ${fLoc}`);
  console.log(`Duplicates:           ${dupes}`);
  console.log(`New offers added:     ${addedOffers.length}`);
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.company}: ${e.error}`);
  }
  if (emptyBoards.length) {
    console.log(`\nBoards returning zero postings (${emptyBoards.length}) — check the slug if a company should be hiring:`);
    for (const name of emptyBoards) console.log(`  ? ${name}`);
  }
  if (addedOffers.length) {
    console.log('\nNew offers:');
    for (const o of addedOffers) console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}`);
    if (dryRun) console.log('\n(dry run — nothing written)');
    else console.log(`\n→ run node rank.mjs --ai to score → data/ats-openings.md`);
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
