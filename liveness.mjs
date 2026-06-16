#!/usr/bin/env node
/**
 * liveness.mjs — is a posting still open? (zero tokens)
 *
 * Checks a job against its SOURCE (the ATS API or the LinkedIn page), which is
 * definitive — a 404 / "no longer accepting applications" means it's closed.
 * Saves you from applying to (or chasing referrals for) dead postings.
 *
 * Usage:
 *   node liveness.mjs <url>      # check one posting → live / closed
 *   node liveness.mjs --top 20   # check the top 20 of each leaderboard → data/liveness-report.md
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';

const arg = process.argv.find((a) => /^https?:\/\//.test(a));
const TOP = (() => { const i = process.argv.indexOf('--top'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 20 : 20; })();

async function head(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 15000);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: 'manual', headers: { 'user-agent': 'jobhunt/1.0' }, ...opts });
  } finally { clearTimeout(t); }
}

// Returns 'live' | 'closed' | 'unknown'
async function checkLiveness(url) {
  let m;
  try {
    // Greenhouse — per-job API: 200 = live, 404 = closed
    if ((m = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/))) {
      const r = await head(`https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs/${m[2]}`);
      return r.status === 200 ? 'live' : r.status === 404 ? 'closed' : 'unknown';
    }
    // Greenhouse via company redirect (e.g. mongodb.com/careers?gh_jid=…) — need slug; skip to board membership
    if ((m = url.match(/[?&]gh_jid=(\d+)/)) && /greenhouse/.test(url) === false) {
      // Can't resolve slug reliably from a branded URL — treat as unknown
      return 'unknown';
    }
    // Lever — per-job API
    if ((m = url.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]+)/))) {
      const r = await head(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}?mode=json`);
      return r.status === 200 ? 'live' : r.status === 404 ? 'closed' : 'unknown';
    }
    // Ashby — fetch the board and check membership
    if ((m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]+)/))) {
      const r = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`, { headers: { 'user-agent': 'jobhunt/1.0' } });
      if (!r.ok) return 'unknown';
      const j = await r.json();
      const found = (j.jobs || []).some((x) => x.jobUrl === url || x.id === m[2]);
      return found ? 'live' : 'closed';
    }
    // Workday — per-job CXS detail endpoint
    if ((m = url.match(/^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/[a-z]{2}-[A-Z]{2}\/([^/]+)(\/job\/.+)$/))) {
      const r = await head(`https://${m[1]}.${m[2]}.myworkdayjobs.com/wday/cxs/${m[1]}/${m[3]}${m[4]}`);
      return r.status === 200 ? 'live' : (r.status === 404 || r.status === 400) ? 'closed' : 'unknown';
    }
    // LinkedIn — guest posting page: look for closed markers
    if (/linkedin\.com\/jobs\/view\/(\d+)/.test(url)) {
      const id = url.match(/\/jobs\/view\/(\d+)/)[1];
      const r = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${id}`, { headers: { 'user-agent': 'Mozilla/5.0' } });
      if (r.status === 404 || r.status === 410) return 'closed';
      if (!r.ok) return 'unknown';
      const html = await r.text();
      if (/no longer accepting applications|no longer available|closed-job|expired/i.test(html)) return 'closed';
      return 'live';
    }
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Single URL ──────────────────────────────────────────────────────

if (arg) {
  const status = await checkLiveness(arg);
  const icon = { live: '✅ LIVE', closed: '❌ CLOSED', unknown: '❔ UNKNOWN (check manually)' }[status];
  console.log(`${icon}\n  ${arg}`);
  process.exit(0);
}

// ── Batch over leaderboards ─────────────────────────────────────────

function parseRows(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const mm of readFileSync(path, 'utf-8').matchAll(/\| *(?:\d+ *\| *)?(?:\*\*\d+\*\*|\d+|—) *\| *\d+ *\| *([^|]+?) *\| *\[([^\]]+)\]\((https?:[^)]+)\) *\|/g))
    rows.push({ company: mm[1].trim(), role: mm[2].trim(), url: mm[3] });
  return rows;
}

const seen = new Set();
const targets = [];
for (const path of ['data/top-openings.md', 'data/linkedin-openings.md']) {
  for (const r of parseRows(path).slice(0, TOP)) {
    if (!seen.has(r.url)) { seen.add(r.url); targets.push(r); }
  }
}
if (!targets.length) { console.log('No leaderboards yet — run node jobhunt.mjs first.'); process.exit(0); }

console.log(`Checking liveness of ${targets.length} openings (top ${TOP} of each list)…\n`);
const results = { live: [], closed: [], unknown: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const t of targets) {
  t.status = await checkLiveness(t.url);
  results[t.status].push(t);
  if (t.status === 'closed') console.log(`  ❌ CLOSED  ${t.company} — ${t.role}`);
  await sleep(400); // gentle
}

const lines = [
  `# Liveness report — ${new Date().toISOString().slice(0, 10)}`, ``,
  `✅ live: ${results.live.length} · ❌ closed: ${results.closed.length} · ❔ unknown: ${results.unknown.length}`, ``,
  `## ❌ Closed — don't apply`, ``,
  ...(results.closed.length ? results.closed.map((t) => `- ${t.company} — [${t.role}](${t.url})`) : ['(none)']),
  ``, `## ❔ Unknown — verify manually`, ``,
  ...(results.unknown.length ? results.unknown.map((t) => `- ${t.company} — [${t.role}](${t.url})`) : ['(none)']),
  ``,
];
writeFileSync('data/liveness-report.md', lines.join('\n'), 'utf-8');
console.log(`\n✅ ${results.live.length} live · ❌ ${results.closed.length} closed · ❔ ${results.unknown.length} unknown`);
console.log(`→ data/liveness-report.md`);
