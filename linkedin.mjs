#!/usr/bin/env node

/**
 * linkedin-scan.mjs — LinkedIn discovery scanner (separate from scan.mjs)
 *
 * Port of the n8n "Job search ultimate workflow": hits LinkedIn's guest
 * search endpoint (paginated) for the queries in config.yml `linkedin:`,
 * archives every discovered card, and fetches descriptions from a capped
 * backlog. Scans are incremental so running the pipeline several times per
 * day does not repeatedly scrape the same 7-day window.
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
 * Usage: node linkedin.mjs [--hours 24] [--force] [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import yaml from 'js-yaml';
import { appendHistoryRows, buildTitleTerms } from './board-store.mjs';

const CONFIG_PATH = 'config.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const JD_CACHE_PATH = 'data/linkedin-jds.json';
const STATE_PATH = 'data/linkedin-scan-state.json';

const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force');
const EXPLICIT_HOURS = (() => {
  const i = process.argv.indexOf('--hours');
  return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 24) : null;
})();

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';
const HEADERS = { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.5', Accept: 'text/html,application/xhtml+xml' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (lo, hi) => lo + Math.random() * (hi - lo);
function writeAtomic(path, content) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf-8');
  renameSync(temp, path);
}

const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
const li = config.linkedin;
if (!li?.queries?.length) {
  console.log('No `linkedin:` queries in config.yml — nothing to do.');
  process.exit(0);
}

// Fetch-order inputs only. Discovery stays deliberately unfiltered (see file
// header) — these decide which of the archived cards spend the JD budget.
const TITLE = buildTitleTerms(config.title_filter);
const BLOCKLIST = (config.company_blocklist ?? []).map((s) => String(s).toLowerCase());
const STAFFING = (config.staffing_agencies ?? []).map((s) => String(s).toLowerCase());

const normText = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
// LinkedIn reposts the same role under many job IDs (one company had 23 copies
// of a single opening), and each copy would otherwise buy its own fetch.
const dupKey = (job) => `${normText(job.company)}|${normText(job.title)}|${normText(job.location)}`;

// Ordering signal, never a discovery filter. null means the card should never
// spend a fetch at all — rank.mjs drops known reposters regardless.
function fetchPriority(job) {
  const title = String(job.title || '').toLowerCase();
  const company = String(job.company || '').toLowerCase();
  if (BLOCKLIST.some((name) => company.includes(name))) return null;
  let priority = 0;
  if (TITLE.hasPositive(job.title)) priority += 3;
  if (TITLE.hasNegative(job.title)) priority -= 5;
  if (STAFFING.some((name) => company.includes(name))) priority -= 3;
  if (/\b202[7-9]\b/.test(title)) priority -= 4; // future cohort — rank.mjs rejects these
  return priority;
}

function loadState() {
  try {
    const state = JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    return state && typeof state === 'object' ? state : {};
  } catch { return {}; }
}

const startedAt = new Date();
const state = loadState();
const lastCompleted = state.last_completed_at ? new Date(state.last_completed_at) : null;
const cooldownMs = Math.max(0, Number(li.cooldown_minutes ?? 90)) * 60000;
if (!FORCE && lastCompleted && !isNaN(lastCompleted.getTime()) && startedAt - lastCompleted < cooldownMs) {
  const remaining = Math.max(1, Math.ceil((cooldownMs - (startedAt - lastCompleted)) / 60000));
  console.log(`LinkedIn scan skipped: last successful scan was ${Math.round((startedAt - lastCompleted) / 60000)}m ago (cooldown: ${li.cooldown_minutes ?? 90}m, ${remaining}m remaining).`);
  console.log('Use --force to scan anyway. Ranking and the 24-hour report can still refresh from the archive.');
  process.exit(0);
}

const elapsedHours = lastCompleted && !isNaN(lastCompleted.getTime())
  ? (startedAt - lastCompleted) / 3600000 + Number(li.overlap_hours ?? 1)
  : Number(li.initial_hours ?? 24);
const HOURS = EXPLICIT_HOURS ?? Math.max(1, Math.min(Number(li.max_lookback_hours ?? 168), Math.ceil(elapsedHours)));

const searchModes = Array.isArray(li.search_modes) && li.search_modes.length
  ? li.search_modes.filter((mode) => mode?.enabled !== false)
  : [{ name: 'broad', experience: [] }];
// Mode-first order deliberately completes the existing broad scan before the
// filtered pass requested by the user.
const searchTasks = searchModes.flatMap((mode) => li.queries.map((query) => ({
  ...query,
  _mode: String(mode.name || 'custom'),
  experience: Array.isArray(mode.experience) ? mode.experience : (query.experience || []),
})));

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

// A single transient blip (timeout, one-off 5xx, a dropped connection) on any
// one of dozens of searches used to permanently freeze last_completed_at —
// the completion gate below requires every search to succeed, and this
// scraper is fragile by nature (see file header). Retry non-block errors a
// couple times with backoff before letting them count as a real failure.
async function fetchTextRetrying(url, attempts = 3) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
      if (/429|999/.test(err.message)) throw err; // real rate-limit — surface immediately
      if (/HTTP 4\d\d/.test(err.message)) throw err; // pulled/forbidden — a retry cannot fix it
      if (i < attempts - 1) await sleep(jitter(1500, 3000) * (i + 1));
    }
  }
  throw lastErr;
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
    const timeTag = block.match(/<time[^>]*datetime="([^"]+)"[^>]*>([\s\S]*?)<\/time>/i);
    const posted = timeTag?.[1] || '';
    const postedText = stripTags(timeTag?.[2] || '');
    if (id && title)
      cards.push({
        url: `https://www.linkedin.com/jobs/view/${id}`,
        title: stripTags(title),
        company: stripTags(company || 'Unknown'),
        location: stripTags(location || ''),
        posted,
        posted_text: postedText,
      });
  }
  return cards;
}

function inferPostedAt(posted, postedText, discoveredAt) {
  const text = String(postedText || '').toLowerCase();
  const base = new Date(discoveredAt);
  let m = text.match(/(\d+)\s*(minute|hour|day|week)s?\s+ago/);
  if (m) {
    const scale = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000 }[m[2]];
    return { posted_at: new Date(base.getTime() - Number(m[1]) * scale).toISOString(), posted_precision: m[2] === 'minute' || m[2] === 'hour' ? 'time' : 'relative-day' };
  }
  if (/just now|moments? ago/.test(text)) return { posted_at: base.toISOString(), posted_precision: 'time' };
  if (posted) {
    const d = new Date(posted);
    if (!isNaN(d.getTime())) return { posted_at: d.toISOString(), posted_precision: /t/i.test(posted) ? 'time' : 'date' };
  }
  return { posted_at: null, posted_precision: 'unknown' };
}

function cleanTsv(value) {
  return String(value || '').replace(/[\t\r\n]+/g, ' ').trim();
}

async function fetchDescription(jobUrl) {
  const id = jobUrl.match(/\/jobs\/view\/(\d+)/)?.[1];
  const html = await fetchTextRetrying(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, 2);
  const desc = html.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/)?.[1];
  return desc ? stripTags(desc).slice(0, 12000) : '';
}

// ── Main ────────────────────────────────────────────────────────────

const seen = loadSeen();
// JD cache is a map keyed by URL ({}). Guard against a stray array/null on disk —
// assigning string keys to an array then JSON.stringify-ing it silently drops them all.
const _rawJd = existsSync(JD_CACHE_PATH) ? JSON.parse(readFileSync(JD_CACHE_PATH, 'utf-8')) : {};
const jdCache = (_rawJd && typeof _rawJd === 'object' && !Array.isArray(_rawJd)) ? _rawJd : {};
const found = new Map();
const observed = new Map();
let blocked = false;
let successfulQueries = 0;
let queryFailures = 0;

console.log(`LinkedIn scan: ${li.queries.length} base queries × ${searchModes.length} modes = ${searchTasks.length} searches, last ${HOURS}h`);
console.log(`Modes: ${searchModes.map((mode) => `${mode.name || 'custom'}${mode.experience?.length ? ` [f_E=${mode.experience.join(',')}]` : ' [unfiltered]'}`).join(' · ')}`);
console.log(`Archive every card, fetch up to ${li.max_new_per_run ?? 25} JDs\n`);

// Paginate each query (LinkedIn serves ~10 cards per page) until a page
// comes back empty — deeper paging = wider net (matches n8n breadth).
const PAGES = li.max_pages ?? li.pages ?? 10;
const STOP_AFTER_SEEN = Math.max(1, Number(li.stop_after_seen_pages ?? 2));
outer:
for (const q of searchTasks) {
  process.stdout.write(`  [${q._mode}] "${q.keywords}" @ ${q.location || 'US'} … `);
  let got = 0, fresh = 0, seenOnlyPages = 0;
  for (let page = 0; page < PAGES; page++) {
    try {
      const cards = parseCards(await fetchTextRetrying(searchUrl(q, page * 10)));
      got += cards.length;
      let pageFresh = 0;
      for (const c of cards) {
        // A URL found by an earlier query is still unseen relative to the
        // archive, so it should keep this query paging deeper — but a card
        // this run already pulled is not evidence of depth. Without the
        // observed check the second mode pages to the limit on every query
        // just re-enumerating the first mode's results.
        if (!seen.has(c.url) && !observed.has(c.url)) pageFresh++;
        observed.set(c.url, c);
        if (!seen.has(c.url) && !found.has(c.url)) { found.set(c.url, { ...c, _mode: q._mode }); fresh++; }
      }
      if (page === 0) successfulQueries++;
      if (!cards.length) break;
      seenOnlyPages = pageFresh ? 0 : seenOnlyPages + 1;
      if (seenOnlyPages >= STOP_AFTER_SEEN) break;
    } catch (err) {
      queryFailures++;
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
const discoveredAt = startedAt.toISOString();
const newJobs = [...found.values()].map((job) => ({ ...job, ...inferPostedAt(job.posted, job.posted_text, discoveredAt), discovered_at: discoveredAt }));

// Enrich already-known/recovered records when they reappear in search. This
// restores precise posting metadata even when the only surviving source was
// scan-history.tsv after an interrupted legacy write.
for (const [url, card] of observed) {
  if (!jdCache[url]) continue;
  const timing = inferPostedAt(card.posted, card.posted_text, discoveredAt);
  // A card first seen as "2 hours ago" carries a real timestamp; re-observed
  // days later the same card only says "3 days ago", and re-deriving from that
  // coarser bucket moves posted_at by up to half a day. Keep the sharper one.
  const keepSharper = jdCache[url].posted_at && jdCache[url].posted_precision === 'time' && timing.posted_precision !== 'time';
  jdCache[url] = {
    ...jdCache[url],
    posted: card.posted,
    posted_text: card.posted_text,
    posted_at: keepSharper ? jdCache[url].posted_at : timing.posted_at,
    posted_precision: keepSharper ? jdCache[url].posted_precision : timing.posted_precision,
    last_seen_at: discoveredAt,
    location: card.location,
    company: card.company,
    title: card.title,
  };
}

// Archive card metadata before fetching details. This makes the fetch cap a
// runtime control, never a discovery-loss control.
for (const job of newJobs) {
  const previous = jdCache[job.url] || {};
  jdCache[job.url] = {
    ...previous,
    desc: previous.desc || '',
    posted: job.posted,
    posted_text: job.posted_text,
    posted_at: job.posted_at,
    posted_precision: job.posted_precision,
    discovered_at: previous.discovered_at || job.discovered_at,
    found_via: previous.found_via || job._mode || null,
    last_seen_at: discoveredAt,
    location: job.location,
    company: job.company,
    title: job.title,
  };
}

// A run discovers several times more cards than the JD budget can describe, so
// the backlog never drains and something is always starved. Ordering by
// recency alone starved it arbitrarily — most of the budget went to titles
// rank.mjs rejects anyway. Order by how likely a card is to survive ranking
// instead, so what goes undescribed is the junk tail, not simply the old tail.
const MAX_DETAIL_AGE_MS = Math.max(1, Number(li.detail_max_age_days ?? 5)) * 86400000;
const describedKeys = new Set();
const describedUrlFor = new Map();
for (const [url, job] of Object.entries(jdCache)) {
  if (!job.desc) continue;
  describedKeys.add(dupKey(job));
  if (!describedUrlFor.has(dupKey(job))) describedUrlFor.set(dupKey(job), url);
}

const skipped = { duplicate: 0, reposter: 0, stale: 0, gone: 0 };
const candidates = [];
for (const [url, job] of Object.entries(jdCache)) {
  if (job.desc) continue;
  if (/HTTP 4\d\d/.test(job.detail_error || '')) { skipped.gone++; continue; }
  const key = dupKey(job);
  if (describedKeys.has(key)) {
    // Same role, different job ID. Left undescribed on purpose rather than
    // copied: the text is not verified for THIS posting, and rank.mjs would
    // score it as if it were. The marker lets ranking collapse them later.
    if (!job.duplicate_of) jdCache[url] = { ...job, duplicate_of: describedUrlFor.get(key) || null };
    skipped.duplicate++;
    continue;
  }
  const priority = fetchPriority(job);
  if (priority === null) { skipped.reposter++; continue; }
  if (!(startedAt - new Date(job.posted_at || job.discovered_at || 0) < MAX_DETAIL_AGE_MS)) { skipped.stale++; continue; }
  candidates.push({ url, ...job, _priority: priority });
}
candidates.sort((a, b) => b._priority - a._priority || String(b.discovered_at || '').localeCompare(String(a.discovered_at || '')));
const detailQueue = candidates.slice(0, cap);
if (candidates.length) {
  console.log(`\nJD backlog: ${candidates.length} eligible (skipped ${skipped.duplicate} duplicate, ${skipped.reposter} reposter, ${skipped.stale} older than ${li.detail_max_age_days ?? 5}d, ${skipped.gone} removed)`);
  console.log(`Fetching ${detailQueue.length} descriptions, best-fit titles first${candidates.length > cap ? ` (${candidates.length - cap} stay archived for the next run)` : ''}…`);
}

// Fetch descriptions from the newest backlog first, politely.
for (const [i, job] of detailQueue.entries()) {
  process.stdout.write(`  JD ${i + 1}/${detailQueue.length}: ${job.company} — ${job.title} … `);
  try {
    await sleep(jitter(2500, 5500));
    const desc = await fetchDescription(job.url);
    jdCache[job.url] = { ...jdCache[job.url], desc, detail_fetched_at: new Date().toISOString() };
    console.log(desc ? 'ok' : 'no description');
  } catch (err) {
    jdCache[job.url] = { ...jdCache[job.url], desc: '', detail_error: err.message, detail_attempted_at: new Date().toISOString() };
    console.log(`failed (${err.message})`);
    if (/429|999/.test(err.message)) { blocked = true; console.log('  ⚠️  rate-limited — stopping detail fetches'); break; }
  }
}

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`New LinkedIn discoveries archived: ${newJobs.length}`);
if (newJobs.length && searchModes.length > 1) {
  // Each mode doubles the search cost; this is the only way to see whether the
  // second pass is actually finding anything the first one missed.
  const perMode = newJobs.reduce((acc, job) => ({ ...acc, [job._mode || 'unknown']: (acc[job._mode || 'unknown'] || 0) + 1 }), {});
  console.log(`First surfaced by: ${Object.entries(perMode).map(([mode, n]) => `${mode} ${n}`).join(' · ')}`);
}
for (const j of newJobs) console.log(`  + ${j.company} | ${j.title} | ${j.location}`);

if (DRY_RUN) {
  console.log('\n(dry run — nothing written)');
  process.exit(0);
}

if (newJobs.length || detailQueue.length || observed.size) {
  // LinkedIn stays in its own lane: JD cache + scan-history only —
  // never written to pipeline.md (separate list by design).
  writeAtomic(JD_CACHE_PATH, JSON.stringify(jdCache, null, 1) + '\n');

  if (newJobs.length) await appendHistoryRows(newJobs.map((j) => [j.url, discoveredAt, 'linkedin', j.title, j.company, 'added', j.location].map(cleanTsv).join('\t')));
  console.log(`\n→ run node rank.mjs --ai to score → data/linkedin-openings.md`);
}

if (!blocked && queryFailures === 0 && successfulQueries === searchTasks.length) {
  writeAtomic(STATE_PATH, JSON.stringify({
    last_completed_at: new Date().toISOString(),
    hours_queried: HOURS,
    base_queries: li.queries.length,
    search_modes: searchModes.map((mode) => mode.name || 'custom'),
    searches: searchTasks.length,
    discoveries: newJobs.length,
    descriptions_attempted: detailQueue.length,
  }, null, 2) + '\n');
} else {
  console.log(`Scan state not advanced because ${blocked ? 'LinkedIn rate-limited' : `${queryFailures} quer${queryFailures === 1 ? 'y' : 'ies'} failed`} this run; the full overlap will be retried.`);
  if (successfulQueries === 0) process.exitCode = 1;
}
