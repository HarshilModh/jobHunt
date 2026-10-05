#!/usr/bin/env node

/**
 * indeed.mjs — Indeed importer (the write-side of the /indeed skill).
 *
 * Indeed can't be scraped from Node: www.indeed.com 403s everything
 * (Cloudflare) and the RSS feed is gone. Fetching happens through the
 * Indeed MCP connector inside Claude Code (.claude/skills/indeed/SKILL.md),
 * which normalizes results into a JSON file and hands it to this script.
 * All file writes live here so dedup + formats stay deterministic.
 *
 * Same own-lane design as linkedin.mjs: JD cache + scan-history only,
 * never pipeline.md. Unlike LinkedIn, results here ARE hard-filtered by
 * config's title_filter / location_filter / company_blocklist (same ones
 * scan.mjs/aggregators.mjs use) — the Indeed MCP connector returns a fixed
 * ~10 results/query with no pagination, so noise (irrelevant industries,
 * gig-work reposters) is too costly to leave for Gemini to sort out after
 * the fact. Survivors still get judged by Gemini for finer-grained fit
 * (experience level, sponsorship language) via rank.mjs --ai.
 *
 * Input JSON: { "jobs": [ { url, title, company, location, posted,
 *                           salary?, job_type?, desc } ] }
 *   url    — an https://to.indeed.com/… apply shortlink
 *   posted — raw "Posted on" text (e.g. "May 21, 2026"); normalized here
 *
 * Identity: shortlinks are PER-IMPRESSION (the same job gets a different
 * link in every search), so each one is resolved here to Indeed's stable
 * job key (the jk= param in the shortlink's redirect — to.indeed.com is
 * not bot-blocked) and stored as https://www.indeed.com/viewjob?jk=….
 * A title|company|location composite key backs up the dedup in case
 * resolution fails.
 *
 * Usage: node indeed.mjs --import <path.json> [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import yaml from 'js-yaml';
import { appendHistoryRows, buildLocationFilter, buildTitleFilter } from './board-store.mjs';

function writeAtomic(path, content) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf-8');
  renameSync(temp, path);
}

const CONFIG_PATH = 'config.yml';
const HISTORY_PATH = 'data/scan-history.tsv';
const JD_CACHE_PATH = 'data/indeed-jds.json';

const DRY_RUN = process.argv.includes('--dry-run');
const IMPORT_PATH = (() => {
  const i = process.argv.indexOf('--import');
  return i !== -1 ? process.argv[i + 1] : null;
})();

if (!IMPORT_PATH) {
  console.log('Usage: node indeed.mjs --import <path.json> [--dry-run]');
  console.log('The JSON comes from the /indeed skill in Claude Code (Indeed MCP connector).');
  process.exit(1);
}

const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
const cap = config.indeed?.max_new_per_run ?? 30;

const titleOk = buildTitleFilter(config.title_filter);
const locOk = buildLocationFilter(config.location_filter);
// Hard-exclude here (unlike rank.mjs's isBlocklisted, which only penalizes
// -40 and flags 🚯) — Indeed's fetch budget is too scarce to spend on
// companies we already know are gig-work reposters or spam. Deliberately
// reads only company_blocklist: config.staffing_agencies (legit W2 staffing
// firms) pass through, since the user is open to W2 contract roles — rank.mjs
// still penalizes them so they don't outrank direct postings.
const blocklist = (config.company_blocklist || []).map((k) => String(k).toLowerCase());
const isBlocklisted = (company) => { const c = (company || '').toLowerCase(); return blocklist.some((k) => c.includes(k)); };

// These fields land in the TSV and in markdown table cells downstream.
const clean = (s) => String(s ?? '').replace(/[\t\n|]/g, ' ').replace(/\s+/g, ' ').trim();
const compositeKey = (j) => `${j.title}|${j.company}|${j.location}`.toLowerCase();

function loadSeen() {
  const seenUrls = new Set();
  const seenKeys = new Set();
  if (existsSync(HISTORY_PATH))
    for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
      const [url, , portal, title, company, , location] = line.split('\t');
      if (url) seenUrls.add(url);
      if (portal === 'indeed' && title) seenKeys.add(compositeKey({ title, company, location: location || '' }));
    }
  return { seenUrls, seenKeys };
}

// Shortlink → https://www.indeed.com/viewjob?jk=… (the stable job key lives
// in the redirect Location; null if the hop fails or has no jk).
async function resolveCanonical(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'manual', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0' } });
    const jk = (r.headers.get('location') || '').match(/[?&]jk=([a-f0-9]+)/)?.[1];
    return jk ? `https://www.indeed.com/viewjob?jk=${jk}` : null;
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

// "May 21, 2026" → "2026-05-21" (null if unparseable — rank.mjs treats that
// as unknown freshness, same as LinkedIn cards without a <time> tag).
function toIso(raw) {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d) ? null : d.toISOString().slice(0, 10);
}

let input;
try {
  input = JSON.parse(readFileSync(IMPORT_PATH, 'utf-8'));
} catch (err) {
  console.error(`Cannot read ${IMPORT_PATH}: ${err.message}`);
  process.exit(1);
}
const jobs = Array.isArray(input?.jobs) ? input.jobs : [];

const { seenUrls, seenKeys } = loadSeen();
// JD cache is a map keyed by URL ({}). Guard against a stray array/null on disk —
// assigning string keys to an array then JSON.stringify-ing it silently drops them all.
const _rawJd = existsSync(JD_CACHE_PATH) ? JSON.parse(readFileSync(JD_CACHE_PATH, 'utf-8')) : {};
const jdCache = (_rawJd && typeof _rawJd === 'object' && !Array.isArray(_rawJd)) ? _rawJd : {};

const found = new Map(); // composite key → job
let skippedInvalid = 0, skippedSeen = 0, skippedFiltered = 0;
for (const j of jobs) {
  const url = String(j?.url ?? '').trim();
  if (!url || !j?.title || !/^https:\/\/([a-z0-9-]+\.)*indeed\.com\//.test(url)) { skippedInvalid++; continue; }
  const job = {
    url,
    title: clean(j.title),
    company: clean(j.company || 'Unknown'),
    location: clean(j.location || ''),
    posted: toIso(j.posted),
    salary: j.salary ? clean(j.salary) : null,
    job_type: j.job_type ? clean(j.job_type) : null,
    desc: String(j.desc ?? '').slice(0, 12000),
  };
  if (!titleOk(job.title) || !locOk(job.location) || isBlocklisted(job.company)) { skippedFiltered++; continue; }
  const key = compositeKey(job);
  if (seenUrls.has(url) || seenKeys.has(key) || found.has(key)) { skippedSeen++; continue; }
  found.set(key, job);
}

const candidates = [...found.values()].slice(0, cap);
if (found.size > cap) console.log(`(capping at ${cap} of ${found.size} new — rest will surface next run)`);

// Canonicalize the per-impression shortlinks, then drop jobs whose stable
// URL is already in history (the composite key misses retitled reposts).
const newJobs = [];
for (const j of candidates) {
  const canonical = await resolveCanonical(j.url);
  if (canonical) {
    if (seenUrls.has(canonical)) { skippedSeen++; continue; }
    seenUrls.add(canonical);
    j.apply = j.url;
    j.url = canonical;
  }
  newJobs.push(j);
}

console.log(`Indeed import: ${jobs.length} records → ${newJobs.length} new` +
  (skippedSeen ? `, ${skippedSeen} already seen` : '') +
  (skippedFiltered ? `, ${skippedFiltered} filtered (title/location/blocklist)` : '') +
  (skippedInvalid ? `, ${skippedInvalid} invalid` : ''));
for (const j of newJobs) console.log(`  + ${j.company} | ${j.title} | ${j.location}`);

if (DRY_RUN) {
  console.log('\n(dry run — nothing written)');
  process.exit(0);
}

if (newJobs.length) {
  // Indeed stays in its own lane: JD cache + scan-history only —
  // never written to pipeline.md (separate list by design).
  for (const j of newJobs)
    jdCache[j.url] = { desc: j.desc, posted: j.posted, location: j.location, company: j.company, title: j.title, salary: j.salary, job_type: j.job_type, apply: j.apply || null };
  writeAtomic(JD_CACHE_PATH, JSON.stringify(jdCache, null, 1) + '\n');

  const date = new Date().toISOString().slice(0, 10);
  await appendHistoryRows(newJobs.map((j) => `${j.url}\t${date}\tindeed\t${j.title}\t${j.company}\tadded\t${j.location}`));
  console.log(`\n→ run node rank.mjs --ai to score → data/indeed-openings.md`);
}
