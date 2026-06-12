#!/usr/bin/env node

/**
 * linkedin-scan.mjs — LinkedIn discovery scanner (separate from scan.mjs)
 *
 * Port of the n8n "Job search ultimate workflow": hits LinkedIn's guest
 * search endpoint (paginated) for the queries in config.yml `linkedin:`,
 * dedups against scan-history, and fetches descriptions for NEW jobs
 * (politely, capped).
 *
 * NO title/level filter on purpose — LinkedIn's level data is unreliable,
 * so Gemini scores every job from the actual JD text instead
 * (rank.mjs --ai → data/linkedin-openings.md, a list kept
 * SEPARATE from the job-board leaderboard).
 *
 * Kept separate from scan.mjs on purpose: LinkedIn scraping is fragile
 * (unofficial, rate-limited, against LinkedIn ToS — personal use, low
 * volume). When it breaks, the board scanner is unaffected.
 *
 * Usage: node linkedin-scan.mjs [--hours 96] [--dry-run]
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

const CONFIG_PATH = 'config.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const JD_CACHE_PATH = 'data/linkedin-jds.json';

const DRY_RUN = process.argv.includes('--dry-run');
const HOURS = (() => {
  const i = process.argv.indexOf('--hours');
  return i !== -1 ? parseInt(process.argv[i + 1], 10) || 96 : 96;
})();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5', Accept: 'text/html,application/xhtml+xml' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);

const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
const li = config.linkedin;
if (!li?.queries?.length) {
  console.log('No `linkedin:` queries in config.yml — nothing to do.');
  process.exit(0);
}

function loadSeen() {
  const seen = new Set();
  if (existsSync(HISTORY_PATH))
    for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  return seen;
}

function decode(s) {
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
}
const stripTags = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function fetchText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(url, { headers: HEADERS, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

// Guest search endpoint returns job-card <li> fragments (no login needed)
function searchUrl(q, start = 0) {
  const p = new URLSearchParams({
    keywords: q.keywords,
    location: q.location || 'United States',
    f_TPR: `r${HOURS * 3600}`,
    sortBy: 'DD',
    start: String(start),
  });
  if (q.experience?.length) p.set('f_E', q.experience.join(','));
  return `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${p}`;
}

function parseCards(html) {
  const cards = [];
  for (const block of html.split(/<li>/i).slice(1)) {
    const id = block.match(/data-entity-urn="urn:li:jobPosting:(\d+)"/)?.[1]
      || block.match(/\/jobs\/view\/[^"]*?-(\d{8,})\??/)?.[1];
    const title = block.match(/base-search-card__title[^>]*>([\s\S]*?)<\//)?.[1];
    const company = block.match(/base-search-card__subtitle[^>]*>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/)?.[1]
      || block.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\//)?.[1];
    const location = block.match(/job-search-card__location[^>]*>([\s\S]*?)<\//)?.[1];
    const posted = block.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    if (id && title)
      cards.push({
        url: `https://www.linkedin.com/jobs/view/${id}`,
        title: stripTags(title),
        company: stripTags(company || 'Unknown'),
        location: stripTags(location || ''),
        posted: posted || '',
      });
  }
  return cards;
}

async function fetchDescription(jobUrl) {
  const id = jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1];
  const html = await fetchText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`);
  const desc = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1];
  return desc ? stripTags(desc).slice(0, 12000) : '';
}

// ── Main ────────────────────────────────────────────────────────────

const seen = loadSeen();
const jdCache = existsSync(JD_CACHE_PATH) ? JSON.parse(readFileSync(JD_CACHE_PATH, 'utf-8')) : {};
const found = new Map();
let blocked = false;

console.log(`LinkedIn scan: ${li.queries.length} queries, last ${HOURS}h, max ${li.max_new_per_run ?? 25} new\n`);

// Paginate each query (LinkedIn serves ~10 cards per page) until a page
// comes back empty — deeper paging = wider net (matches n8n breadth).
const PAGES = li.pages ?? 4;
outer:
for (const q of li.queries) {
  process.stdout.write(`  "${q.keywords}" @ ${q.location || 'US'} … `);
  let got = 0, fresh = 0;
  for (let page = 0; page < PAGES; page++) {
    try {
      const cards = parseCards(await fetchText(searchUrl(q, page * 10)));
      got += cards.length;
      for (const c of cards)
        if (!seen.has(c.url) && !found.has(c.url)) { found.set(c.url, c); fresh++; }
      if (!cards.length) break;
    } catch (err) {
      console.log(`failed (${err.message})`);
      if (/429|999/.test(err.message)) { blocked = true; break outer; }
      break;
    }
    await sleep(jitter(2500, 5000));
  }
  console.log(`${got} results, ${fresh} new`);
}

if (blocked) console.log('\n⚠️  LinkedIn is rate-limiting this IP — try again in a few hours. Board scan is unaffected.');

const cap = li.max_new_per_run ?? 25;
const newJobs = [...found.values()].slice(0, cap);
if (found.size > cap) console.log(`\n(capping at ${cap} of ${found.size} new — rest will surface next run)`);

// Fetch descriptions for new matches only, politely
for (const [i, job] of newJobs.entries()) {
  process.stdout.write(`  JD ${i + 1}/${newJobs.length}: ${job.company} — ${job.title} … `);
  try {
    await sleep(jitter(2500, 5500));
    const desc = await fetchDescription(job.url);
    jdCache[job.url] = { desc, posted: job.posted, location: job.location, company: job.company, title: job.title };
    console.log(desc ? 'ok' : 'no description');
  } catch (err) {
    jdCache[job.url] = { desc: '', posted: job.posted, location: job.location, company: job.company, title: job.title };
    console.log(`failed (${err.message})`);
    if (/429|999/.test(err.message)) { console.log('  ⚠️  rate-limited — stopping detail fetches'); break; }
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`New LinkedIn offers: ${newJobs.length}`);
for (const j of newJobs) console.log(`  + ${j.company} | ${j.title} | ${j.location}`);

if (DRY_RUN) {
  console.log('\n(dry run — nothing written)');
  process.exit(0);
}

if (newJobs.length) {
  // LinkedIn stays in its own lane: JD cache + scan-history only —
  // never written to pipeline.md (separate list by design).
  writeFileSync(JD_CACHE_PATH, JSON.stringify(jdCache, null, 1), 'utf-8');

  if (!existsSync(HISTORY_PATH))
    writeFileSync(HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n', 'utf-8');
  const date = new Date().toISOString().slice(0, 10);
  appendFileSync(HISTORY_PATH, newJobs.map((j) => `${j.url}\t${date}\tlinkedin\t${j.title}\t${j.company}\tadded\t${j.location}`).join('\n') + '\n', 'utf-8');
  console.log(`\n→ run node rank.mjs --ai to score → data/linkedin-openings.md`);
}
