#!/usr/bin/env node
/**
 * aggregators.mjs — open-ended discovery beyond the company list (zero tokens).
 *
 * scan.mjs is limited to companies in config.yml. This pulls from community
 * job aggregators (SimplifyJobs New-Grad + Internships by default), applies the
 * SAME title + location filters, dedups against data/scan-history.tsv +
 * pipeline.md, and appends new openings to data/pipeline.md — so they get ranked
 * by rank.mjs exactly like board/LinkedIn results.
 *
 * Each SimplifyJobs listing carries a `sponsorship` field. For an F-1 search:
 *   "U.S. Citizenship is Required"  → dropped (ineligible)
 *   "Does Not Offer Sponsorship"    → kept but counted + flagged in the summary
 *   everything else                 → kept
 *
 * Usage:
 *   node aggregators.mjs                 # all enabled sources, last 30 days
 *   node aggregators.mjs --days 7        # only postings from the last 7 days
 *   node aggregators.mjs --days 0        # no date filter (every active listing)
 *   node aggregators.mjs --dry-run       # preview, write nothing
 *   node aggregators.mjs --source intern # one source (substring match on id)
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';

const CONFIG_PATH = 'config.yml';
const HISTORY_PATH = 'data/scan-history.tsv';
const PIPELINE_PATH = 'data/pipeline.md';

mkdirSync('data', { recursive: true });

// Defaults if config.yml has no `aggregators:` block.
const DEFAULT_SOURCES = [
  { id: 'simplify-newgrad', url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json', enabled: true },
  { id: 'simplify-intern', url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json', enabled: true },
];
const DEFAULT_DAYS = 30;

// ── HTTP ────────────────────────────────────────────────────────────

async function fetchJson(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'jobhunt/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  } finally {
    clearTimeout(t);
  }
}

// ── Filters (identical semantics to scan.mjs) ───────────────────────

function buildTitleFilter(tf) {
  const pos = (tf?.positive || []).map((k) => k.toLowerCase());
  const neg = (tf?.negative || []).map((k) => k.toLowerCase());
  return (title) => {
    const s = (title || '').toLowerCase();
    return (pos.length === 0 || pos.some((k) => s.includes(k))) && !neg.some((k) => s.includes(k));
  };
}

function buildLocationFilter(lf) {
  if (!lf) return () => true;
  const norm = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v])).filter((x) => typeof x === 'string').map((x) => x.toLowerCase().trim()).filter(Boolean);
  const always = norm(lf.always_allow), allow = norm(lf.allow), block = norm(lf.block);
  return (loc) => {
    if (typeof loc !== 'string' || !loc.trim()) return true;
    const s = loc.toLowerCase();
    if (always.length && always.some((k) => s.includes(k))) return true;
    if (block.length && block.some((k) => s.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some((k) => s.includes(k));
  };
}

// "U.S. Citizenship is Required" → ineligible on F-1. Match loosely.
const isCitizenshipRequired = (s) => /citizen/i.test(s || '');
const isNoSponsorship = (s) => /does not offer sponsorship|no sponsorship/i.test(s || '');

// ── Dedup + writers (same files/format as scan.mjs) ─────────────────

function loadSeen() {
  const seen = new Set();
  if (existsSync(HISTORY_PATH))
    for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const url = line.split('\t')[0];
      if (url) seen.add(url);
    }
  if (existsSync(PIPELINE_PATH))
    for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/- \[[ x]\] (https?:\/\/\S+)/g)) seen.add(m[1]);
  return seen;
}

function appendToPipeline(offers) {
  let text = existsSync(PIPELINE_PATH) ? readFileSync(PIPELINE_PATH, 'utf-8') : '# Pipeline — pending offers inbox\n\n## Pendientes\n';
  const lines = offers.map((o) => `- [ ] ${o.url} | ${o.company} | ${o.title}`).join('\n');
  const idx = text.indexOf('## Pendientes');
  if (idx === -1) { text += `\n## Pendientes\n\n${lines}\n`; }
  else {
    const insertAt = text.indexOf('\n', idx) + 1;
    text = `${text.slice(0, insertAt)}\n${lines}${text.slice(insertAt)}`;
  }
  writeFileSync(PIPELINE_PATH, text, 'utf-8');
}

function appendToHistory(offers, date) {
  if (!existsSync(HISTORY_PATH))
    writeFileSync(HISTORY_PATH, 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n', 'utf-8');
  appendFileSync(HISTORY_PATH, offers.map((o) => `${o.url}\t${date}\t${o.source}\t${o.title}\t${o.company}\tadded\t${o.location || ''}`).join('\n') + '\n', 'utf-8');
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const di = args.indexOf('--days');
  const si = args.indexOf('--source');
  const sourceFilter = si !== -1 ? args[si + 1]?.toLowerCase() : null;

  const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
  const agg = config.aggregators || {};
  const days = di !== -1 ? Number(args[di + 1]) : (Number.isFinite(agg.default_days) ? agg.default_days : DEFAULT_DAYS);
  const dropCitizenship = agg.drop_citizenship_required !== false; // default on (F-1)
  const sources = (agg.sources || DEFAULT_SOURCES).filter((s) => s?.enabled !== false && (!sourceFilter || s.id.toLowerCase().includes(sourceFilter)));

  const titleOk = buildTitleFilter(config.title_filter);
  const locOk = buildLocationFilter(config.location_filter);

  const cutoff = days > 0 ? Math.floor(Date.now() / 1000) - days * 86400 : 0;
  console.log(`Aggregators: ${sources.map((s) => s.id).join(', ')}`);
  console.log(`Window: ${days > 0 ? `last ${days} days` : 'all active'}${dryRun ? '  (dry run)' : ''}\n`);

  const seen = loadSeen();
  const date = new Date().toISOString().slice(0, 10);
  let total = 0, fInactive = 0, fDate = 0, fTitle = 0, fLoc = 0, fCitizen = 0, dupes = 0, noSponsor = 0;
  const newOffers = [];
  const errors = [];

  for (const src of sources) {
    let listings;
    try {
      listings = await fetchJson(src.url);
    } catch (e) { errors.push({ source: src.id, error: e.message }); continue; }
    if (!Array.isArray(listings)) { errors.push({ source: src.id, error: 'not a JSON array' }); continue; }
    total += listings.length;

    for (const j of listings) {
      if (!j?.url || !j?.title) continue;
      if (j.active === false) { fInactive++; continue; }
      if (cutoff && Number(j.date_posted || j.date_updated || 0) < cutoff) { fDate++; continue; }
      if (dropCitizenship && isCitizenshipRequired(j.sponsorship)) { fCitizen++; continue; }
      if (!titleOk(j.title)) { fTitle++; continue; }
      const location = Array.isArray(j.locations) ? j.locations.join(', ') : (j.location || '');
      if (!locOk(location)) { fLoc++; continue; }
      if (seen.has(j.url)) { dupes++; continue; }
      seen.add(j.url);
      const flagged = isNoSponsorship(j.sponsorship);
      if (flagged) noSponsor++;
      newOffers.push({
        title: (j.title || '').trim(),
        url: j.url,
        company: (j.company_name || '').trim() || 'Unknown',
        location,
        source: src.id,
        noSponsor: flagged,
      });
    }
  }

  if (!dryRun && newOffers.length) { appendToPipeline(newOffers); appendToHistory(newOffers, date); }

  console.log('━'.repeat(45));
  console.log(`Listings pulled:        ${total}`);
  console.log(`Filtered inactive:      ${fInactive}`);
  if (cutoff) console.log(`Filtered by date:       ${fDate}`);
  console.log(`Dropped citizenship-req:${fCitizen}`);
  console.log(`Filtered by title:      ${fTitle}`);
  console.log(`Filtered by location:   ${fLoc}`);
  console.log(`Duplicates:             ${dupes}`);
  console.log(`New offers added:       ${newOffers.length}  (${noSponsor} flagged "no sponsorship")`);
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.source}: ${e.error}`);
  }
  if (newOffers.length) {
    console.log('\nNew offers:');
    for (const o of newOffers) console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}${o.noSponsor ? '  ⚠️ no-sponsor' : ''}`);
    if (dryRun) console.log('\n(dry run — nothing written)');
    else console.log(`\n→ run node rank.mjs --ai to score → data/top-openings.md`);
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
