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
  for (const path of ['data/top-openings.md', 'data/linkedin-openings.md']) {
    if (!existsSync(path)) continue;
    const src = path.includes('linkedin') ? 'LI' : '';
    for (const m of readFileSync(path, 'utf-8').matchAll(/\| *\d+ *\| *(?:\*\*)?(\d+|—)(?:\*\*)? *\| *(\d+) *\| *([^|]+?) *\| *\[([^\]]+)\]\(([^)]+)\) *\| *([^|]*?) *\| *([^|]*?) *\| *([^|]*?) *\| *([^|]*?) *\|/g)) {
      const score = m[1] === '—' ? +m[2] : +m[1];
      const signals = m[9] || '';
      if (score < MIN) continue;
      if (NEW_ONLY && !signals.includes('🆕')) continue;
      if (signals.includes('no-sponsor')) continue;
      const key = `${m[3].trim().toLowerCase()}::${m[4].trim().toLowerCase()}`;
      if (applied.has(key)) continue;
      rows.push({ score, company: m[3].trim(), role: m[4].trim(), url: m[5], posted: m[7] || '', signals, src });
    }
  }
  // de-dupe by url, keep highest score
  const byUrl = new Map();
  for (const r of rows) if (!byUrl.has(r.url) || r.score > byUrl.get(r.url).score) byUrl.set(r.url, r);
  return [...byUrl.values()].sort((a, b) => b.score - a.score).slice(0, 12);
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
for (const r of apply) console.log(`   ${String(r.score).padStart(3)}  ${r.company} — ${r.role}  ${r.signals.replace(/💬.*/, '').trim()}`);

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
