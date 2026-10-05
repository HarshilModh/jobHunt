#!/usr/bin/env node
/**
 * aggregators.mjs — open-ended discovery beyond the company list (zero tokens).
 *
 * scan.mjs is limited to companies in config.yml. This pulls from community
 * job aggregators (SimplifyJobs + speedyapply, new-grad + intern, by default),
 * applies the SAME title + location filters, dedups against data/scan-history.tsv
 * + pipeline.md, and appends new openings to data/pipeline.md — so they get ranked
 * by rank.mjs exactly like board/LinkedIn results.
 *
 * Sources are JSON (SimplifyJobs listings.json schema) or, with `format: markdown`,
 * a README markdown table (speedyapply) parsed into the same listing shape.
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

import { readFileSync, mkdirSync } from 'fs';
import yaml from 'js-yaml';
import { buildLocationFilter, buildTitleFilter, persistBoardOffers } from './board-store.mjs';

const CONFIG_PATH = 'config.yml';
mkdirSync('data', { recursive: true });

// Defaults if config.yml has no `aggregators:` block.
const DEFAULT_SOURCES = [
  { id: 'simplify-newgrad', url: 'https://raw.githubusercontent.com/SimplifyJobs/New-Grad-Positions/dev/.github/scripts/listings.json', enabled: true },
  { id: 'simplify-intern', url: 'https://raw.githubusercontent.com/SimplifyJobs/Summer2026-Internships/dev/.github/scripts/listings.json', enabled: true },
];
const DEFAULT_DAYS = 30;

// ── HTTP ────────────────────────────────────────────────────────────

async function fetchHttp(url, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'jobhunt/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res;
  } finally {
    clearTimeout(t);
  }
}
const fetchJson = (url, timeoutMs) => fetchHttp(url, timeoutMs).then((r) => r.json());
const fetchText = (url, timeoutMs) => fetchHttp(url, timeoutMs).then((r) => r.text());

// ── Markdown-table feeds (speedyapply, jobright, …) ─────────────────
// Some community boards publish only a README markdown table, not a JSON
// listings file. We parse those tables into the SAME listing shape the JSON
// path produces (url, title, company_name, locations, date_posted, active),
// so the rest of the pipeline treats them identically.

const stripTags = (s) => (s || '').replace(/<[^>]+>/g, '').trim();
// Cell → human company/title text: prefer <strong>…</strong>, then [label](url), else
// plain. Strips a leading status emoji (e.g. "🚀 Affirm", "🔥 NVIDIA" → "Affirm"/"NVIDIA").
const cellText = (s) => {
  const strong = (s || '').match(/<strong>(.*?)<\/strong>/is);
  let v = strong ? stripTags(strong[1]) : null;
  if (v == null) {
    const link = (s || '').match(/\[([^\]]+)\]\([^)]*\)/);
    v = link ? stripTags(link[1]) : stripTags(s);
  }
  // Strip markdown bold (vanshb03 uses **Company**) — leftover ** breaks tier lookup.
  return v.replace(/\*\*/g, '').replace(/^[^\p{L}\p{N}(]+/u, '').trim();
};
// Cell → first hyperlink target (HTML href or markdown link).
const cellHref = (s) => {
  const html = (s || '').match(/href="([^"]+)"/i);
  if (html) return html[1];
  const md = (s || '').match(/\]\(([^)]+)\)/);
  return md ? md[1] : '';
};
// Relative ("17d", "1 day ago", "Today", "yesterday"), ISO ("2026-02-26"), or
// "Jun 22" → epoch seconds (approx). 0 if unparseable.
function parsePostedAt(s, now = Date.now()) {
  const v = (s || '').trim();
  if (!v) return 0;
  const low = v.toLowerCase();
  if (/^(today|just posted|new)$/.test(low)) return Math.floor(now / 1000);
  if (low === 'yesterday') return Math.floor(now / 1000 - 86400);
  // "17d", "3w", "2mo", or "N hours/days/weeks/months/years ago"
  const rel = low.match(/(\d+)\s*(hour|hr|h|day|d|week|w|month|mo|year|yr|y)s?\b/);
  if (rel) {
    const n = Number(rel[1]);
    const u = rel[2];
    const days = /^(hour|hr|h)$/.test(u) ? n / 24 : /^(day|d)$/.test(u) ? n
      : /^(week|w)$/.test(u) ? n * 7 : /^(month|mo)$/.test(u) ? n * 30 : n * 365;
    return Math.floor(now / 1000 - days * 86400);
  }
  // Absolute dates. ISO/full dates (with a 4-digit year) parse directly; for
  // year-less forms ("Jun 22") V8's Date.parse silently defaults to year 2001,
  // so append the current year before parsing. A source board posts month/day
  // only — a listing from last September, parsed against this year's Sept,
  // must be pulled back a year rather than left dated in the future.
  const hasYear = /\d{4}/.test(v);
  let abs = hasYear ? Date.parse(v) : Date.parse(`${v} ${new Date(now).getUTCFullYear()}`);
  if (!hasYear && Number.isFinite(abs) && abs > now + 86400000) abs = Date.parse(`${v} ${new Date(now).getUTCFullYear() - 1}`);
  if (!Number.isFinite(abs)) abs = Date.parse(v);
  return Number.isFinite(abs) ? Math.floor(abs / 1000) : 0;
}

function splitRow(line) {
  const body = line.replace(/^\||\|$/g, '');
  const cells = [];
  let cell = '';
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '|' && body[i - 1] !== '\\') { cells.push(cell.trim()); cell = ''; }
    else cell += body[i];
  }
  cells.push(cell.trim());
  return cells.map((value) => value.replace(/\\\|/g, '|'));
}
const isSeparator = (line) => /^\|?\s*:?-{2,}/.test(line) && /-\s*\|/.test(`${line}|`);

function postedPrecision(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return 'unknown';
  if (/\b(?:hour|hr|h)s?\b/.test(text) || /t\d{2}:\d{2}/i.test(text)) return 'timestamp';
  if (/today|yesterday|\bday|\bweek|\bmonth|\byear|\b\d+d\b|\b\d+w\b|\b\d+mo\b/.test(text)) return 'relative-day';
  return 'date';
}

function parseMarkdownListings(text) {
  const lines = text.split('\n');
  const out = [];
  let cols = null; // current header → column index map
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('|')) { cols = null; continue; }
    // A header row is one immediately followed by a |---|---| separator.
    if (lines[i + 1] && isSeparator(lines[i + 1].trim())) {
      const names = splitRow(line).map((c) => c.toLowerCase());
      const find = (...keys) => names.findIndex((n) => keys.some((k) => n.includes(k)));
      cols = {
        company: find('company'),
        title: find('position', 'title', 'role'),
        location: find('location'),
        posting: find('posting', 'apply', 'link'),
        age: find('age'),
        date: find('date', 'posted'),
      };
      i++; // skip the separator
      continue;
    }
    if (!cols || isSeparator(line)) continue;
    const c = splitRow(line);
    const at = (idx) => (idx >= 0 ? c[idx] || '' : '');
    const company = cellText(at(cols.company));
    const title = cellText(at(cols.title));
    // Apply URL: dedicated posting column if present, else the title link.
    const url = cellHref(at(cols.posting)) || cellHref(at(cols.title));
    if (!company || !title || !url) continue;
    const postedText = cols.age >= 0 ? at(cols.age) : cols.date >= 0 ? at(cols.date) : '';
    const when = parsePostedAt(postedText);
    out.push({
      title, url, company_name: company, active: true,
      locations: [stripTags(at(cols.location))], date_posted: when, sponsorship: '',
      posted_raw: stripTags(postedText), posted_precision: postedPrecision(postedText),
    });
  }
  return out;
}

// Preserve explicit source eligibility metadata. Avoid treating phrases such
// as "citizenship not required" as a rejection.
const isCitizenshipRequired = (s) => {
  const text = String(s || '').toLowerCase();
  if (/citizenship (?:is )?not required|no citizenship requirement/.test(text)) return false;
  return /(?:u\.?s\.? |united states )?citizenship (?:is )?required|must be (?:a )?u\.?s\.? citizen|u\.?s\.? citizens? only/.test(text);
};
const isNoSponsorship = (s) => /does not offer sponsorship|no sponsorship|will not sponsor|cannot sponsor|sponsorship (?:is )?not available/i.test(s || '');

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

  const observedAt = new Date().toISOString();
  let total = 0, fInactive = 0, fDate = 0, fTitle = 0, fLoc = 0, fCitizen = 0, dupes = 0, noSponsor = 0;
  const newOffers = [];
  const errors = [];

  for (const src of sources) {
    let listings;
    try {
      const isMd = src.format === 'markdown' || /\.md($|\?)/i.test(src.url) || /readme/i.test(src.url);
      listings = isMd ? parseMarkdownListings(await fetchText(src.url)) : await fetchJson(src.url);
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
      const company = (j.company_name || '').trim() || 'Unknown';
      const flagged = isNoSponsorship(j.sponsorship);
      if (flagged) noSponsor++;
      newOffers.push({
        title: (j.title || '').trim(),
        url: j.url,
        company,
        location,
        source: src.id,
        postedAt: j.date_posted || j.date_updated || null,
        postedPrecision: j.posted_precision || ((j.date_posted || j.date_updated) ? 'timestamp' : 'unknown'),
        postedRaw: j.posted_raw || '',
        sponsorship: j.sponsorship || '',
        noSponsor: flagged,
      });
    }
  }

  const persisted = await persistBoardOffers(newOffers, {
    lane: 'aggregator',
    blocklist: config.company_blocklist || [],
    staffing: config.staffing_agencies || [],
    dryRun,
    observedAt,
  });
  dupes = persisted.duplicateCount;
  const addedOffers = persisted.added;

  console.log('━'.repeat(45));
  console.log(`Listings pulled:        ${total}`);
  console.log(`Filtered inactive:      ${fInactive}`);
  if (cutoff) console.log(`Filtered by date:       ${fDate}`);
  console.log(`Dropped citizenship-req:${fCitizen}`);
  console.log(`Filtered by title:      ${fTitle}`);
  console.log(`Filtered by location:   ${fLoc}`);
  console.log(`Duplicates:             ${dupes}`);
  console.log(`New offers added:       ${addedOffers.length}  (${noSponsor} flagged "no sponsorship")`);
  if (errors.length) {
    console.log(`\nErrors (${errors.length}):`);
    for (const e of errors) console.log(`  ✗ ${e.source}: ${e.error}`);
  }
  if (addedOffers.length) {
    console.log('\nNew offers:');
    for (const o of addedOffers) console.log(`  + ${o.company} | ${o.title} | ${o.location || 'N/A'}${o.no_sponsor ? '  ⚠️ no-sponsor' : ''}`);
    if (dryRun) console.log('\n(dry run — nothing written)');
    else console.log(`\n→ run node rank.mjs --ai to score → data/aggregator-openings.md`);
  }
}

main().catch((e) => { console.error('Fatal:', e.message); process.exit(1); });
