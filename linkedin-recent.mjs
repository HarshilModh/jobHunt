#!/usr/bin/env node
/**
 * linkedin-recent.mjs — just the recent LinkedIn window, refreshed each run.
 *
 * Filters the full LinkedIn list (data/linkedin-openings.md) down to jobs
 * posted within the chosen window and OVERWRITES data/linkedin-recent.md.
 * jobhunt.mjs calls this with whatever freshness you pick (24h / 4d / …), so
 * the file always holds your latest window — replaced every run, never piled up.
 *
 * Usage:
 *   node linkedin-recent.mjs            # last 24 hours (default)
 *   node linkedin-recent.mjs --days 4   # last 4 days
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const SRC = 'data/linkedin-openings.md';
const OUT = 'data/linkedin-recent.md';
const DAYS = (() => { const i = process.argv.indexOf('--days'); return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 1) : 1; })();
const label = DAYS === 1 ? 'last 24 hours' : `last ${DAYS} days`;

if (!existsSync(SRC)) {
  console.log(`No ${SRC} yet — run node jobhunt.mjs (with LinkedIn) first.`);
  process.exit(0);
}

// Parse scored rows from the leaderboard (both the apply-first 9-col table and
// the full-ranking 6-col table). Posted cell looks like "2026-06-10 (3d)".
function parseRows(text) {
  const rows = new Map();
  const re = /\| *(?:\d+ *\| *)?(\*\*\d+\*\*|\d+|—) *\| *(\d+) *\| *([^|]+?) *\| *\[([^\]]+)\]\((https?:[^)]+)\) *\| *([^|]*?) *\| *([^|]*?) *\|/g;
  for (const m of text.matchAll(re)) {
    const ai = m[1].replace(/\*\*/g, '');
    const posted = m[7].trim();
    const dm = posted.match(/\((\d+)d\)/);
    rows.set(m[5], {
      ai: ai === '—' ? null : Number(ai),
      score: Number(m[2]),
      company: m[3].trim(),
      role: m[4].trim(),
      url: m[5],
      location: m[6].trim(),
      posted,
      daysAgo: dm ? Number(dm[1]) : null,
    });
  }
  return [...rows.values()];
}

const all = parseRows(readFileSync(SRC, 'utf-8'));
// Keep only datable postings inside the window (undated ones can't be confirmed recent).
const recent = all.filter((r) => r.daysAgo !== null && r.daysAgo <= DAYS);
recent.sort((a, b) => (b.ai ?? b.score) - (a.ai ?? a.score) || b.score - a.score);

const lines = [
  `# LinkedIn — ${label}`, ``,
  `> ${recent.length} openings posted in the ${label}. Replaced every run (last refresh ${new Date().toISOString().slice(0, 10)}).`,
  `> AI = Gemini score (lead with this) · Score = heuristic cross-check. Full list: data/linkedin-openings.md`,
  ``,
  `| AI | Score | Company | Role | Location | Posted |`,
  `|----|-------|---------|------|----------|--------|`,
  ...recent.map((r) => `| ${r.ai != null ? `**${r.ai}**` : '—'} | ${r.score} | ${r.company} | [${r.role}](${r.url}) | ${r.location || '—'} | ${r.posted || '—'} |`),
  ``,
];
writeFileSync(OUT, lines.join('\n'), 'utf-8');

console.log(`✓ ${recent.length} LinkedIn openings (${label}) → ${OUT}`);
for (const r of recent.slice(0, 10))
  console.log(`  ${r.ai != null ? `AI:${String(r.ai).padStart(3)}` : '      '} h:${String(r.score).padStart(3)}  ${r.company} — ${r.role}`);
