#!/usr/bin/env node
/**
 * dsa.mjs — a company's most-asked LeetCode problems (zero tokens).
 *
 * Pulls company-wise question frequency from a public GitHub mirror of
 * LeetCode's company tags (liquidslr/leetcode-company-wise-problems) and
 * writes a ranked study list to data/dsa-{company}.md.
 *
 * Honest note: this data is community-scraped from LeetCode Premium and can be
 * stale. Treat it as "what this company has historically favored," not a
 * guarantee of what you'll be asked. Pair it with the algo-sensei skill to drill.
 *
 * Usage:
 *   node dsa.mjs Stripe
 *   node dsa.mjs "Hudson River Trading" --window all   # 30d|3m|6m|more|all (default 6m)
 *   node dsa.mjs Stripe --top 40
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const REPO = 'liquidslr/leetcode-company-wise-problems';
const COMPANIES_CACHE = 'data/dsa-companies.json';

const argv = process.argv.slice(2);
const company = argv.filter((a) => !a.startsWith('--') && !/^\d+$/.test(a)).join(' ').trim()
  || (() => { const i = argv.indexOf('--company'); return i !== -1 ? argv[i + 1] : ''; })();
const WINDOW = (() => { const i = argv.indexOf('--window'); return i !== -1 ? argv[i + 1] : '6m'; })();
const TOP = (() => { const i = argv.indexOf('--top'); return i !== -1 ? parseInt(argv[i + 1], 10) || 25 : 25; })();

if (!company) { console.log('Usage: node dsa.mjs <company> [--window 30d|3m|6m|more|all] [--top 25]'); process.exit(0); }

const WINDOW_FILE = {
  '30d': '1. Thirty Days', '3m': '2. Three Months', '6m': '3. Six Months',
  'more': '4. More Than Six Months', 'all': '5. All',
}[WINDOW] || '3. Six Months';

async function getText(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'jobhunt/1.0' } });
    return r.ok ? await r.text() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// Resolve the exact (case-sensitive) folder name for a company.
async function resolveFolder(name) {
  let folders = [];
  if (existsSync(COMPANIES_CACHE)) {
    try { folders = JSON.parse(readFileSync(COMPANIES_CACHE, 'utf-8')); } catch {}
  }
  if (!folders.length) {
    const json = await getText(`https://api.github.com/repos/${REPO}/contents/`);
    if (json) {
      folders = JSON.parse(json).filter((e) => e.type === 'dir').map((e) => e.name);
      writeFileSync(COMPANIES_CACHE, JSON.stringify(folders), 'utf-8');
    }
  }
  const low = name.toLowerCase();
  return folders.find((f) => f.toLowerCase() === low)
    || folders.find((f) => f.toLowerCase().includes(low) || low.includes(f.toLowerCase()))
    || null;
}

// Minimal CSV parser that respects quoted fields (Topics has commas).
function parseCsv(text) {
  const rows = [];
  for (const line of text.split('\n').slice(1)) {
    if (!line.trim()) continue;
    const cells = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) { if (c === '"') inQ = false; else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ',') { cells.push(cur); cur = ''; }
      else cur += c;
    }
    cells.push(cur);
    // Difficulty, Title, Frequency, Acceptance Rate, Link, Topics
    if (cells.length >= 6) rows.push({ diff: cells[0], title: cells[1], freq: parseFloat(cells[2]) || 0, link: cells[4], topics: cells[5] });
  }
  return rows;
}

// ── Main ────────────────────────────────────────────────────────────

const folder = await resolveFolder(company);
if (!folder) { console.log(`'${company}' not found in the LeetCode company list. Try the exact company name, or a different one.`); process.exit(0); }

const fileUrl = (w) => `https://raw.githubusercontent.com/${REPO}/main/${encodeURIComponent(folder)}/${encodeURIComponent(w)}.csv`;
let usedWindow = WINDOW_FILE;
let all = parseCsv((await getText(fileUrl(WINDOW_FILE))) || '');
// The chosen window can exist but be empty for smaller companies — fall back to "All".
if (!all.length && WINDOW_FILE !== '5. All') {
  all = parseCsv((await getText(fileUrl('5. All'))) || '');
  usedWindow = '5. All';
}
if (!all.length) { console.log(`No question data for ${folder} (the repo may not track it).`); process.exit(0); }

const rows = all.sort((a, b) => b.freq - a.freq).slice(0, TOP);
const byDiff = (d) => rows.filter((r) => r.diff.toUpperCase() === d).length;

// Topic frequency → what patterns to drill
const topicCount = {};
for (const r of rows) for (const t of r.topics.split(',').map((x) => x.trim()).filter(Boolean)) topicCount[t] = (topicCount[t] || 0) + 1;
const topTopics = Object.entries(topicCount).sort((a, b) => b[1] - a[1]).slice(0, 8);

const out = [
  `# DSA — ${folder} (most-asked, ${usedWindow.replace(/^\d+\.\s*/, '')})`, ``,
  `> Community-scraped from LeetCode company tags — historically favored, not guaranteed. Drill with the algo-sensei skill.`,
  `> ${rows.length} problems · ${byDiff('EASY')} easy · ${byDiff('MEDIUM')} medium · ${byDiff('HARD')} hard`,
  ``,
  `**Patterns to drill (by frequency here):** ${topTopics.map(([t, n]) => `${t} (${n})`).join(' · ')}`,
  ``,
  `| # | Freq | Difficulty | Problem | Topics |`,
  `|---|------|------------|---------|--------|`,
  ...rows.map((r, i) => `| ${i + 1} | ${r.freq.toFixed(0)} | ${r.diff} | [${r.title}](${r.link}) | ${r.topics} |`),
  ``,
];
const outPath = `data/dsa-${folder.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`;
writeFileSync(outPath, out.join('\n'), 'utf-8');

console.log(`✓ ${folder}: top ${rows.length} problems → ${outPath}`);
console.log(`  patterns: ${topTopics.slice(0, 5).map(([t]) => t).join(', ')}`);
console.log(`  top 5:`);
for (const r of rows.slice(0, 5)) console.log(`   ${r.freq.toFixed(0).padStart(3)}  [${r.diff[0]}] ${r.title}`);
