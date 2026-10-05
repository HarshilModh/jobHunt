#!/usr/bin/env node
/**
 * board-recent.mjs — accurate ATS + aggregator decision views.
 *
 * Reads the structured archives written by rank.mjs, applies a rolling window
 * when timestamps are exact, labels date-only/discovery fallbacks honestly,
 * and suppresses canonical and semantic duplicates without deleting history.
 *
 * Usage: node board-recent.mjs [--days 1]
 */

import { existsSync, readFileSync } from 'node:fs';
import { writeAtomic } from './board-store.mjs';

const DAYS = (() => {
  const index = process.argv.indexOf('--days');
  return index === -1 ? 1 : Math.max(0, parseInt(process.argv[index + 1], 10) || 0);
})();
const now = new Date();
const windowMs = DAYS * 86400000;
const cutoff = DAYS ? new Date(now.getTime() - windowMs) : null;
const label = DAYS === 0 ? 'complete retained view' : DAYS === 1 ? 'last 24 hours' : `last ${DAYS} days`;

const inputs = [
  { lane: 'ats', path: 'data/ats-ranked.json', out: 'data/ats-recent.md', title: 'ATS' },
  { lane: 'aggregator', path: 'data/aggregator-ranked.json', out: 'data/aggregator-recent.md', title: 'Aggregators' },
];

function readRows(input) {
  if (!existsSync(input.path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(input.path, 'utf-8'));
    return (Array.isArray(parsed) ? parsed : parsed.rows || []).map((row) => ({ ...row, lane: input.lane }));
  } catch (error) {
    console.error(`Could not parse ${input.path}: ${error.message}`);
    process.exitCode = 1;
    return [];
  }
}

const ageMs = (raw) => {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : now - date;
};

function calendarAge(raw) {
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  const today = Date.parse(`${now.toISOString().slice(0, 10)}T00:00:00Z`);
  const then = Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  return Math.floor((today - then) / 86400000);
}

function freshness(row) {
  const postedAge = ageMs(row.postedAt);
  if (postedAge != null && row.postedPrecision === 'timestamp') {
    return {
      include: DAYS === 0 || (postedAge >= -3600000 && postedAge <= windowMs),
      confidence: 'exact', basis: 'source posting timestamp', age: postedAge,
    };
  }
  if (postedAge != null) {
    const days = calendarAge(row.postedAt);
    return {
      include: DAYS === 0 || (days != null && days >= 0 && days <= DAYS),
      confidence: 'approximate', basis: 'source date/relative day only', age: postedAge,
    };
  }

  const discoveredAge = ageMs(row.discoveredAt);
  if (discoveredAge != null && row.discoveredPrecision === 'timestamp') {
    return {
      include: DAYS === 0 || (discoveredAge >= -3600000 && discoveredAge <= windowMs),
      confidence: 'discovered', basis: 'discovered during scan; posting time unknown', age: discoveredAge,
    };
  }
  if (discoveredAge != null) {
    const days = calendarAge(row.discoveredAt);
    return {
      include: DAYS === 0 || (days != null && days >= 0 && days <= DAYS),
      confidence: 'discovered-approximate', basis: 'discovery date only; posting time unknown', age: discoveredAge,
    };
  }
  return { include: DAYS === 0, confidence: 'unknown', basis: 'no usable timestamp', age: null };
}

const norm = (value) => String(value || '').toLowerCase()
  .replace(/&amp;/g, ' and ')
  .replace(/\b(?:incorporated|inc|llc|ltd|corp|corporation|company|co)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();
const normTitle = (value) => norm(String(value || '')
  .replace(/\b(?:job|req(?:uisition)?)\s*(?:id|#)?\s*[:#-]?\s*[a-z0-9-]+\b/gi, ' ')
  .replace(/\((?:remote|hybrid|onsite|on-site)[^)]*\)/gi, ' '));
const normLocation = (value) => {
  const text = norm(value).replace(/\bunited states\b|\busa\b/g, ' ').trim();
  return /\bremote\b/.test(text) ? 'remote' : text;
};

function preference(row) {
  const quality = { direct: 0, 'direct/unknown': 1, unknown: 2, staffing: 3, reposter: 4 }[row.sourceQuality] ?? 2;
  const decision = { apply: 0, review: 1, skip: 2, quarantine: 3 }[row.decision] ?? 1;
  const confidence = { exact: 0, approximate: 1, discovered: 2, 'discovered-approximate': 3, unknown: 4 }[row.freshness.confidence] ?? 4;
  return [quality, row.lane === 'ats' ? 0 : 1, decision, row.hasDescription ? 0 : 1, row.ai == null ? 1 : 0, confidence, -(row.ai ?? row.heuristic ?? 0)];
}

function better(a, b) {
  const pa = preference(a), pb = preference(b);
  for (let index = 0; index < pa.length; index++) {
    if (pa[index] !== pb[index]) return pa[index] < pb[index] ? a : b;
  }
  return a;
}

function groupRows(rows, keyFor) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyFor(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

const all = inputs.flatMap(readRows).map((row) => ({ ...row, freshness: freshness(row) }));
const recent = all.filter((row) => row.freshness.include);

// Canonical URL/job-id duplicates first.
let groups = groupRows(recent, (row) => row.canonicalKey || row.url);
let rows = groups.map((group) => group.reduce(better));
const suppressed = groups.filter((group) => group.length > 1).map((group) => ({ chosen: group.reduce(better), rows: group.filter((row) => row !== group.reduce(better)), reason: 'same canonical job/URL' }));

// Same employer, normalized role, and location across direct and mirror URLs.
groups = groupRows(rows, (row) => `${norm(row.company)}::${normTitle(row.title)}::${normLocation(row.location)}`);
rows = groups.map((group) => group.reduce(better));
for (const group of groups.filter((bucket) => bucket.length > 1)) {
  const chosen = group.reduce(better);
  suppressed.push({ chosen, rows: group.filter((row) => row !== chosen), reason: 'same normalized employer/role/location' });
}

// Jobright/reposter copies frequently alter the location formatting. Collapse
// company+title without location only when at least one indirect source exists.
groups = groupRows(rows, (row) => `${norm(row.company)}::${normTitle(row.title)}`);
const finalRows = [];
for (const group of groups) {
  const hasIndirect = group.some((row) => ['reposter', 'staffing'].includes(row.sourceQuality));
  if (group.length > 1 && hasIndirect) {
    const chosen = group.reduce(better);
    finalRows.push(chosen);
    suppressed.push({ chosen, rows: group.filter((row) => row !== chosen), reason: 'direct posting preferred over indirect source' });
  } else finalRows.push(...group);
}

function sortRows(list) {
  return list.sort((a, b) => {
    const decision = ({ apply: 0, review: 1, skip: 2, quarantine: 3 }[a.decision] ?? 1)
      - ({ apply: 0, review: 1, skip: 2, quarantine: 3 }[b.decision] ?? 1);
    return decision || (b.ai ?? b.heuristic ?? 0) - (a.ai ?? a.heuristic ?? 0)
      || (b.heuristic ?? 0) - (a.heuristic ?? 0)
      || (a.freshness.age ?? Infinity) - (b.freshness.age ?? Infinity);
  });
}

const mdCell = (value) => String(value ?? '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
const mdLinkText = (value) => mdCell(value).replace(/([\[\]])/g, '\\$1');
const hours = (milliseconds) => Math.max(0, Math.round(milliseconds / 3600000));
const decisionLabel = (row) => ({ apply: '🟢 Apply', review: '🟡 Review', skip: '🔴 Skip', quarantine: '🚯 Quarantine' }[row.decision] || '🟡 Review');

function postedLabel(row) {
  if (row.freshness.confidence === 'exact') return `${new Date(row.postedAt).toISOString().slice(0, 16).replace('T', ' ')}Z (${hours(row.freshness.age)}h)`;
  if (row.freshness.confidence === 'approximate') return `${String(row.postedAt).slice(0, 10)} (date only ≈)`;
  if (row.discoveredAt && row.freshness.confidence === 'discovered') return `found ${hours(row.freshness.age)}h ago (posted unknown)`;
  if (row.discoveredAt) return `found ${String(row.discoveredAt).slice(0, 10)} (date only; posted unknown)`;
  return '—';
}

function signals(row) {
  return [
    ...(row.flags || []),
    ...(row.decisionReasons || []).map((reason) => `· ${reason}`),
    row.aiReason ? `💬 ${row.aiReason}` : '',
  ].filter(Boolean).join(' ') || '—';
}

function table(list) {
  return [
    '| AI | Score | Decision | Company | Role | Location | Posted | Salary | Signals |',
    '|----|-------|----------|---------|------|----------|--------|--------|---------|',
    ...list.map((row) => `| ${row.ai != null ? `**${row.ai}**` : '—'} | ${row.heuristic ?? '—'} | ${decisionLabel(row)} | ${mdCell(row.company)} | [${mdLinkText(row.title)}](${row.url}) | ${mdCell(row.location)} | ${postedLabel(row)} | ${mdCell(row.salary)} | ${mdCell(signals(row))} |`),
  ];
}

for (const input of inputs) {
  const laneRows = sortRows(finalRows.filter((row) => row.lane === input.lane));
  const sections = [
    ['Apply first', laneRows.filter((row) => row.decision === 'apply')],
    ['Review manually', laneRows.filter((row) => row.decision === 'review')],
    ['Skip / quarantine', laneRows.filter((row) => row.decision === 'skip' || row.decision === 'quarantine')],
  ];
  const rawLane = recent.filter((row) => row.lane === input.lane);
  const laneSuppressed = suppressed.filter((group) => group.rows.some((row) => row.lane === input.lane));
  const suppressedCount = laneSuppressed.reduce((sum, group) => sum + group.rows.filter((row) => row.lane === input.lane).length, 0);
  const exactCount = rawLane.filter((row) => row.freshness.confidence === 'exact').length;
  const approximateCount = rawLane.length - exactCount;
  const noJdCount = laneRows.filter((row) => !row.hasDescription).length;
  const lines = [
    `# ${input.title} — ${label}`,
    '',
    `> Refreshed ${now.toISOString()}${cutoff ? ` · exact cutoff ${cutoff.toISOString()}` : ''}.`,
    `> ${rawLane.length} raw in-window rows → ${laneRows.length} unique decision rows · ${suppressedCount} duplicate copies hidden.`,
    `> Freshness confidence: ${exactCount} exact source timestamps · ${approximateCount} approximate/date-only or discovery-time. Discovery-time rows are not claimed as newly posted.`,
    `> JD coverage after deduplication: ${laneRows.length - noJdCount}/${laneRows.length}. Jobs without JD text cannot receive an AI score or Apply decision.`,
    '> AI is the primary fit score; Score is the deterministic cross-check. Eligibility gates override both.',
    '',
    '## How the archive works',
    '',
    `- \`data/${input.lane === 'ats' ? 'ats' : 'aggregator'}-ranked.json\`: structured, complete scored archive.`,
    `- \`data/${input.lane === 'ats' ? 'ats' : 'aggregator'}-openings.md\`: readable complete archive; it is not a freshness view.`,
    `- \`${input.out}\`: this replace-on-run ${label} decision view; duplicate suppression never deletes archive records.`,
  ];
  for (const [name, sectionRows] of sections) lines.push('', `## ${name} (${sectionRows.length})`, '', ...table(sectionRows));
  lines.push('', `## Duplicate suppression (${suppressedCount} rows)`, '');
  if (!laneSuppressed.length) lines.push('No duplicate copies were suppressed in this window.');
  else {
    lines.push('| Kept | Suppressed copies | Reason |', '|------|-------------------|--------|');
    for (const group of laneSuppressed.slice(0, 30)) {
      const copies = group.rows.filter((row) => row.lane === input.lane).map((row) => `${row.company} — ${row.title}`).join('; ');
      lines.push(`| [${mdLinkText(`${group.chosen.company} — ${group.chosen.title}`)}](${group.chosen.url}) | ${mdCell(copies)} | ${group.reason} |`);
    }
  }
  lines.push('');
  writeAtomic(input.out, lines.join('\n'));
  console.log(`✓ ${input.title}: ${rawLane.length} in-window rows → ${laneRows.length} unique (${suppressedCount} hidden) → ${input.out}`);
  for (const [name, sectionRows] of sections) console.log(`  ${name}: ${sectionRows.length}`);
}
