#!/usr/bin/env node
/**
 * linkedin-recent.mjs — accurate decision view over the retained LinkedIn archive.
 *
 * Reads structured ranking data, applies a rolling freshness window, suppresses
 * semantic duplicates in this view only, and separates apply/review/skip.
 * Nothing is deleted from linkedin-jds.json or linkedin-openings.md.
 *
 * Usage: node linkedin-recent.mjs [--days 1]
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';

function writeAtomic(path, content) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf-8');
  renameSync(temp, path);
}

const SRC = 'data/linkedin-ranked.json';
const OUT = 'data/linkedin-recent.md';
const DAYS = (() => {
  const i = process.argv.indexOf('--days');
  return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 1) : 1;
})();
const WINDOW_MS = DAYS * 86400000;
const now = new Date();
const cutoff = new Date(now.getTime() - WINDOW_MS);
const label = DAYS === 1 ? 'last 24 hours' : `last ${DAYS} days`;

if (!existsSync(SRC)) {
  console.log(`No ${SRC} yet — run node rank.mjs once to build the structured LinkedIn ranking.`);
  process.exit(0);
}

let payload;
try { payload = JSON.parse(readFileSync(SRC, 'utf-8')); }
catch (err) {
  console.error(`Could not parse ${SRC}: ${err.message}`);
  process.exit(1);
}
const all = Array.isArray(payload) ? payload : payload.rows || [];

const ageMs = (raw) => {
  if (!raw) return null;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : now - d;
};

function freshness(row) {
  const postedAge = ageMs(row.postedAt);
  const discoveredAge = ageMs(row.discoveredAt);
  if (postedAge != null && row.postedPrecision === 'time') {
    return { include: postedAge >= -3600000 && postedAge <= WINDOW_MS, confidence: 'exact', basis: 'posted time', age: postedAge };
  }
  if (postedAge != null && ['date', 'relative-day'].includes(row.postedPrecision)) {
    // LinkedIn's date-only cards cannot prove an exact 24-hour boundary. Keep
    // today/yesterday for a one-day report, but label them as approximate.
    const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
    const postedDay = new Date(`${new Date(row.postedAt).toISOString().slice(0, 10)}T00:00:00Z`);
    const calendarDays = Math.floor((today - postedDay) / 86400000);
    return { include: calendarDays >= 0 && calendarDays <= DAYS, confidence: 'approximate', basis: 'LinkedIn date only', age: postedAge };
  }
  if (discoveredAge != null) {
    return { include: discoveredAge >= -3600000 && discoveredAge <= WINDOW_MS, confidence: 'discovered', basis: 'discovered in scan; posted time unknown', age: discoveredAge };
  }
  return { include: false, confidence: 'unknown', basis: 'no usable timestamp', age: null };
}

const recent = all.map((row) => ({ ...row, freshness: freshness(row) })).filter((row) => row.freshness.include);

const norm = (value) => String(value || '').toLowerCase()
  .replace(/&amp;/g, ' and ')
  .replace(/\b(?:incorporated|inc|llc|ltd|corp|corporation|company|co)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();
const normTitle = (value) => norm(String(value || '')
  .replace(/\b(?:job|req(?:uisition)?)\s*(?:id|#)?\s*[:#-]?\s*[a-z0-9-]+\b/gi, ' ')
  .replace(/\((?:remote|hybrid|onsite|on-site)[^)]*\)/gi, ' '));
const normLocation = (value) => {
  const text = norm(value).replace(/\bunited states\b|\busa\b/g, ' ').trim();
  if (/\bremote\b/.test(text)) return 'remote';
  return text;
};
const semanticKey = (row) => `${norm(row.company)}::${normTitle(row.title)}::${normLocation(row.location)}`;

function preference(row) {
  const source = { 'direct/unknown': 0, staffing: 1, reposter: 2 }[row.sourceQuality] ?? 1;
  const decision = { apply: 0, review: 1, skip: 2, quarantine: 3 }[row.decision] ?? 1;
  const hasAi = row.ai == null ? 1 : 0;
  const exact = row.freshness.confidence === 'exact' ? 0 : 1;
  return [source, decision, hasAi, exact, -(row.ai ?? row.heuristic ?? 0), -(row.heuristic ?? 0)];
}
function better(a, b) {
  const pa = preference(a), pb = preference(b);
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pa[i] < pb[i] ? a : b;
  return a;
}

// Pass 1: same normalized company + role + location.
const primaryGroups = new Map();
for (const row of recent) {
  const key = semanticKey(row);
  if (!primaryGroups.has(key)) primaryGroups.set(key, []);
  primaryGroups.get(key).push(row);
}
const groups = [...primaryGroups.values()];

// Pass 2: exact JD fingerprint + title across different company labels, but
// only when a reposter/staffing source is involved. This avoids collapsing
// legitimate same-company openings in different offices.
const crossGroups = new Map();
for (const group of groups) {
  const best = group.reduce(better);
  const key = best.descriptionFingerprint ? `${best.descriptionFingerprint}::${normTitle(best.title)}` : null;
  if (!key) continue;
  if (!crossGroups.has(key)) crossGroups.set(key, []);
  crossGroups.get(key).push(group);
}
const merged = new Set();
const finalGroups = [];
for (const bucket of crossGroups.values()) {
  const companies = new Set(bucket.flat().map((row) => norm(row.company)));
  const hasIndirect = bucket.flat().some((row) => row.sourceQuality === 'reposter' || row.sourceQuality === 'staffing');
  if (bucket.length > 1 && companies.size > 1 && hasIndirect) {
    finalGroups.push(bucket.flat());
    bucket.forEach((group) => merged.add(group));
  }
}
for (const group of groups) if (!merged.has(group)) finalGroups.push(group);

const kept = [];
const duplicateGroups = [];
for (const group of finalGroups) {
  const chosen = group.reduce(better);
  kept.push(chosen);
  if (group.length > 1) duplicateGroups.push({ chosen, suppressed: group.filter((row) => row.url !== chosen.url) });
}

function sortRows(rows) {
  return rows.sort((a, b) => {
    const ai = (b.ai ?? b.heuristic ?? 0) - (a.ai ?? a.heuristic ?? 0);
    return ai || (b.heuristic ?? 0) - (a.heuristic ?? 0) || (a.freshness.age ?? Infinity) - (b.freshness.age ?? Infinity);
  });
}
const isNY = (row) => /new york|new jersey|\bnyc\b|\bny\b|\bnj\b|brooklyn,? (?:ny|new york)|queens,? (?:ny|new york)|bronx,? (?:ny|new york)|staten island,? (?:ny|new york)|jersey city|hoboken/i.test(row.location || '');
const sections = [
  ['Apply first — NYC / NJ', sortRows(kept.filter((row) => row.decision === 'apply' && isNY(row)))],
  ['Apply first — remote / rest of US', sortRows(kept.filter((row) => row.decision === 'apply' && !isNY(row)))],
  ['Review manually', sortRows(kept.filter((row) => row.decision === 'review'))],
  ['Skip / quarantine', sortRows(kept.filter((row) => row.decision === 'skip' || row.decision === 'quarantine'))],
];

const mdCell = (value) => String(value ?? '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
const mdLinkText = (value) => mdCell(value).replace(/([\[\]])/g, '\\$1');
const hours = (ms) => Math.max(0, Math.round(ms / 3600000));
function postedLabel(row) {
  if (row.freshness.confidence === 'exact') return `${new Date(row.postedAt).toISOString().slice(0, 16).replace('T', ' ')}Z (${hours(row.freshness.age)}h)`;
  if (row.freshness.confidence === 'approximate') return `${String(row.postedAt).slice(0, 10)} (date only ≈)`;
  if (row.discoveredAt) return `found ${hours(row.freshness.age)}h ago (posted unknown)`;
  return '—';
}
const decisionLabel = (row) => ({ apply: '🟢 Apply', review: '🟡 Review', skip: '🔴 Skip', quarantine: '🚯 Quarantine' }[row.decision] || '🟡 Review');
function signals(row) {
  return [
    ...(row.flags || []),
    ...(row.decisionReasons || []).map((reason) => `· ${reason}`),
    row.aiReason ? `💬 ${row.aiReason}` : '',
  ].filter(Boolean).join(' ') || '—';
}
function table(rows) {
  return [
    `| AI | Score | Decision | Company | Role | Location | Posted | Salary | Signals |`,
    `|----|-------|----------|---------|------|----------|--------|--------|---------|`,
    ...rows.map((row) => `| ${row.ai != null ? `**${row.ai}**` : '—'} | ${row.heuristic ?? '—'} | ${decisionLabel(row)} | ${mdCell(row.company)} | [${mdLinkText(row.title)}](${row.url}) | ${mdCell(row.location)} | ${postedLabel(row)} | ${mdCell(row.salary)} | ${mdCell(signals(row))} |`),
  ];
}

const exactCount = recent.filter((row) => row.freshness.confidence === 'exact').length;
const approximateCount = recent.filter((row) => row.freshness.confidence !== 'exact').length;
const suppressedCount = duplicateGroups.reduce((sum, group) => sum + group.suppressed.length, 0);
const lines = [
  `# LinkedIn — ${label}`,
  ``,
  `> Refreshed ${now.toISOString()} · cutoff ${cutoff.toISOString()} · ${recent.length} raw recent rows → ${kept.length} unique decision rows.`,
  `> Freshness confidence: ${exactCount} exact timestamp · ${approximateCount} approximate/date-only or discovery-time. “Date only ≈” cannot prove the exact 24-hour boundary.`,
  `> AI is the primary fit score; Score is the deterministic cross-check. Eligibility gates override both.`,
  `> ${suppressedCount} duplicate rows are hidden here only; every original remains in the archive.`,
  ``,
  `## How the archive works`,
  ``,
  `- \`data/linkedin-jds.json\`: permanent raw discovery/JD archive; scans add or enrich records and do not prune them.`,
  `- \`data/linkedin-ranked.json\` and \`data/linkedin-openings.md\`: complete scored archive, including skips and reposts.`,
  `- \`data/linkedin-recent.md\`: this replace-on-run ${label} decision view; duplicates are suppressed only here.`,
];

for (const [name, rows] of sections) lines.push(``, `## ${name} (${rows.length})`, ``, ...table(rows));

lines.push(``, `## Duplicate suppression (${suppressedCount} rows)`, ``);
if (!duplicateGroups.length) lines.push(`No semantic duplicates found in this window.`);
else {
  lines.push(`| Kept | Suppressed copies | Why |`, `|------|-------------------|-----|`);
  for (const group of duplicateGroups.slice(0, 25)) {
    const names = group.suppressed.map((row) => `${row.company} — ${row.title}`).join('; ');
    lines.push(`| [${mdLinkText(`${group.chosen.company} — ${group.chosen.title}`)}](${group.chosen.url}) | ${mdCell(names)} | same normalized role/location or exact reposted JD |`);
  }
  if (duplicateGroups.length > 25) lines.push(``, `> ${duplicateGroups.length - 25} additional duplicate groups omitted from this summary; originals remain in the full archive.`);
}
lines.push(``);

writeAtomic(OUT, lines.join('\n'));
console.log(`✓ ${recent.length} recent LinkedIn rows → ${kept.length} unique decision rows (${suppressedCount} duplicates hidden) → ${OUT}`);
for (const [name, rows] of sections) console.log(`  ${name}: ${rows.length}`);
