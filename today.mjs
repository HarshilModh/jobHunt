#!/usr/bin/env node
/**
 * today.mjs — your daily to-do, in one screen (zero tokens).
 *
 * Consolidates:
 *   1. Apply-first: top openings you haven't applied to yet
 *   2. Referral nudges due (from data/referrals.md, 6/12-day cadence)
 *   3. Application follow-ups due (Applied >6 days ago, no response)
 *   4. Pipeline snapshot (counts by status)
 *
 * Usage:
 *   node today.mjs            # apply list = score >= 70
 *   node today.mjs --min 80   # raise the bar
 *   node today.mjs --new      # only 🆕 (posted <= 7 days)
 */

import { readFileSync, existsSync } from 'fs';

const MIN = (() => { const i = process.argv.indexOf('--min'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 70 : 70; })();
const NEW_ONLY = process.argv.includes('--new');
const today = new Date();
const daysSince = (d) => Math.floor((today - new Date(d)) / 86400000);

// ── Applied-to set (so we don't resurface them) ─────────────────────

function appliedKeys() {
  const set = new Set();
  if (!existsSync('data/applications.md')) return set;
  for (const line of readFileSync('data/applications.md', 'utf-8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (c.length < 7 || !c[3] || c[3] === 'Company') continue;
    set.add(`${c[3].toLowerCase()}::${(c[4] || '').toLowerCase()}`);
  }
  return set;
}

// ── 1. Apply-first ──────────────────────────────────────────────────

function applyList() {
  const applied = appliedKeys();
  const rows = [];
  // Read the structured archives, not the rendered markdown. The old regex
  // scrape only honoured the Decision column when a file happened to have one,
  // so 🟡 review rows leaked into "APPLY FIRST".
  const lanes = [
    ['ATS', 'data/ats-ranked.json'],
    ['AGG', 'data/aggregator-ranked.json'],
    ['LI', 'data/linkedin-ranked.json'],
  ];
  for (const [src, path] of lanes) {
    if (!existsSync(path)) continue;
    let parsed;
    try { parsed = JSON.parse(readFileSync(path, 'utf-8')); } catch { continue; }
    for (const r of parsed.rows || []) {
      if (r.decision !== 'apply') continue;
      if (r.sponsorshipRisk === 'high') continue;
      if (NEW_ONLY && !(Number.isFinite(r.daysAgo) && r.daysAgo <= 7)) continue;
      const score = r.ai ?? r.heuristic ?? 0;
      if (score < MIN) continue;
      const key = `${String(r.company).toLowerCase()}::${String(r.title).toLowerCase()}`;
      if (applied.has(key)) continue;
      rows.push({
        score, ai: r.ai, heuristic: r.heuristic,
        company: r.company, role: r.title, url: r.url,
        daysAgo: r.daysAgo, flags: (r.flags || []).join(' '), src,
      });
    }
  }
  // De-dupe the same posting across lanes, then again on company+role so a
  // reposted listing doesn't occupy two slots.
  const byUrl = new Map();
  for (const r of rows) if (!byUrl.has(r.url) || r.score > byUrl.get(r.url).score) byUrl.set(r.url, r);
  const byRole = new Map();
  for (const r of byUrl.values()) {
    const k = `${r.company.toLowerCase()}::${r.role.toLowerCase()}`;
    if (!byRole.has(k) || r.score > byRole.get(k).score) byRole.set(k, r);
  }
  return [...byRole.values()].sort((a, b) => b.score - a.score).slice(0, 12);
}

// ── 2. Referral nudges due ──────────────────────────────────────────

function referralNudges() {
  if (!existsSync('data/referrals.md')) return [];
  const REPLIED = ['replied', 'referred', 'declined', 'closed', 'interview', 'offer'];
  const due = [];
  for (const line of readFileSync('data/referrals.md', 'utf-8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (c.length < 8 || !/^\d{4}-\d{2}-\d{2}$/.test(c[1])) continue;
    const status = (c[6] || '').toLowerCase();
    if (REPLIED.some((s) => status.includes(s))) continue;
    const nudges = (status.match(/nudge|follow/g) || []).length;
    if (nudges >= 2) continue;
    const age = daysSince(c[1]);
    if (age >= (nudges === 0 ? 6 : 12)) due.push({ company: c[2], person: c[3], age, nudge: nudges + 1 });
  }
  return due;
}

// ── 3. Application follow-ups + 4. status counts ────────────────────

function applications() {
  const counts = {};
  const followups = [];
  if (!existsSync('data/applications.md')) return { counts, followups };
  for (const line of readFileSync('data/applications.md', 'utf-8').split('\n')) {
    const c = line.split('|').map((s) => s.trim());
    if (c.length < 7 || !/^\d{4}-\d{2}-\d{2}$/.test(c[2] || '')) continue;
    const status = (c[6] || '').toLowerCase() || 'applied';
    counts[status] = (counts[status] || 0) + 1;
    if (status.includes('applied') && !status.includes('nudg')) {
      const age = daysSince(c[2]);
      if (age >= 7) followups.push({ company: c[3], role: c[4], age });
    }
  }
  return { counts, followups };
}

// ── Render ──────────────────────────────────────────────────────────

console.log(`\n📅  jobhunt — ${today.toISOString().slice(0, 10)}\n`);

const apply = applyList();
console.log(`① APPLY FIRST  (score ≥ ${MIN}${NEW_ONLY ? ', 🆕 only' : ''}, not yet applied)`);
if (!apply.length) console.log('   nothing new — run node jobhunt.mjs to refresh, or lower --min');
for (const r of apply) {
  const age = Number.isFinite(r.daysAgo) ? `${r.daysAgo}d` : '—';
  const both = r.ai == null ? `heur ${r.heuristic}` : `AI ${r.ai} / heur ${r.heuristic}`;
  console.log(`   ${String(r.score).padStart(3)}  [${r.src}] ${r.company} — ${r.role}  (${both}, ${age}) ${r.flags}`.trimEnd());
}

const nudges = referralNudges();
console.log(`\n② REFERRAL NUDGES DUE  (${nudges.length})`);
if (!nudges.length) console.log('   none — log outreach in data/referrals.md so this can remind you');
for (const n of nudges) console.log(`   ${n.company} — ${n.person} (${n.age}d ago, nudge #${n.nudge})  → node referrals.mjs --followups`);

const { counts, followups } = applications();
console.log(`\n③ APPLICATION FOLLOW-UPS DUE  (${followups.length})`);
if (!followups.length) console.log('   none');
for (const f of followups) console.log(`   ${f.company} — ${f.role} (applied ${f.age}d ago, no response)`);

const statusLine = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(' · ') || 'no applications logged yet';
console.log(`\n④ PIPELINE  ${statusLine}`);
console.log('');
