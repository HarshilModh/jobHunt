#!/usr/bin/env node

/**
 * referrals.mjs — Referral-target finder (safe, semi-automated)
 *
 * For each company on your leaderboard, generates the LinkedIn searches that
 * surface people who can refer you: alumni from your schools + people from
 * your past companies who now work there. Writes a clickable worksheet to
 * data/referral-targets.md.
 *
 * It does NOT scrape people, send connection requests, or message anyone —
 * those are ToS violations and ban risks. You open each search in your
 * browser (logged in), pick real humans, and send a personalized note
 * yourself. This script just removes the busywork of building searches and
 * drafting the first version of each message.
 *
 * Usage:
 *   node referrals.mjs                 # build worksheet: top 15 companies
 *   node referrals.mjs --min-ai 80     # only companies with an opening scoring >= 80
 *   node referrals.mjs --top 25        # how many companies to include
 *   node referrals.mjs --followups     # show who is due for a nudge + draft it
 *
 * Each company block includes a LinkedIn DM draft AND an email draft with a
 * mailto: link (opens your mail client pre-filled — you add the address and
 * send). It never sends anything itself: no scraping, no blasting, no creds.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import yaml from 'js-yaml';

const CONFIG_PATH = 'config.yml';
const BOARD_PATH = 'data/top-openings.md';
const LINKEDIN_PATH = 'data/linkedin-openings.md';
const OUT_PATH = 'data/referral-targets.md';

const argTop = (() => { const i = process.argv.indexOf('--top'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 15 : 15; })();
const minAi = (() => { const i = process.argv.indexOf('--min-ai'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 0 : 0; })();
const FOLLOWUPS = process.argv.includes('--followups');
const EMAIL_IDX = process.argv.indexOf('--email');

// Referral follow-up cadence: one polite nudge ~6 days after first contact,
// a final one ~6 days after that, then stop (never more than 2).
const FIRST_NUDGE_DAYS = 6;
const SECOND_NUDGE_DAYS = 12;
const MAX_NUDGES = 2;
const REPLIED_STATUSES = ['replied', 'referred', 'declined', 'closed', 'interview', 'offer'];

const config = existsSync(CONFIG_PATH) ? yaml.load(readFileSync(CONFIG_PATH, 'utf-8')) : {};
const profile = config.profile || {};
const networks = config.referral_networks || profile.referral_networks || {};
const schools = networks.schools || [];
const exCompanies = networks.companies || [];
const myName = profile.name || 'me';

// ── Follow-up mode: who's due for a nudge? ──────────────────────────

function runFollowups() {
  const path = 'data/referrals.md';
  if (!existsSync(path)) {
    console.log('No data/referrals.md yet — log some outreach first (run node referrals.mjs to create it).');
    return;
  }
  const today = new Date();
  const daysBetween = (d) => Math.floor((today - new Date(d)) / 86400000);
  const rows = [];
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const cells = line.split('|').map((s) => s.trim());
    // | Date | Company | Person | Role | Channel | Status | Follow-up due |  → 7 fields + 2 edge empties
    if (cells.length < 8 || !/^\d{4}-\d{2}-\d{2}$/.test(cells[1])) continue;
    rows.push({ date: cells[1], company: cells[2], person: cells[3], role: cells[4], channel: cells[5], status: cells[6].toLowerCase() });
  }
  if (!rows.length) { console.log('No logged outreach in data/referrals.md yet.'); return; }

  const due = [];
  for (const r of rows) {
    if (REPLIED_STATUSES.some((s) => r.status.includes(s))) continue;
    const age = daysBetween(r.date);
    // crude nudge count: "nudged" / "followed up" notes in status bump the threshold
    const nudges = (r.status.match(/nudge|follow/g) || []).length;
    if (nudges >= MAX_NUDGES) continue;
    const threshold = nudges === 0 ? FIRST_NUDGE_DAYS : SECOND_NUDGE_DAYS;
    if (age >= threshold) due.push({ ...r, age, nudge: nudges + 1 });
  }

  if (!due.length) {
    console.log(`✓ No follow-ups due. ${rows.length} contacts logged, all either replied or still inside the ${FIRST_NUDGE_DAYS}-day window.`);
    return;
  }
  console.log(`\n📨  ${due.length} follow-up(s) due:\n`);
  for (const r of due) {
    console.log(`  ${r.company} — ${r.person} (${r.channel}, ${r.age} days ago, nudge #${r.nudge})`);
    const note = r.nudge === 1
      ? `Hi ${r.person.split(' ')[0] || '[first name]'}, just floating this back up — still very interested in the ${r.role} role at ${r.company}. No worries if now's not a good time. Thanks!`
      : `Hi ${r.person.split(' ')[0] || '[first name]'}, last nudge from me — if a referral isn't possible, totally understand. Either way I appreciate you. Thanks!`;
    console.log(`     → ${note}\n`);
  }
  console.log(`After sending, update the Status in data/referrals.md (e.g. "nudged 2026-06-17") so it stops reminding you.`);
}

if (FOLLOWUPS) { runFollowups(); process.exit(0); }

// ── Email-pattern guesser ───────────────────────────────────────────
// `node referrals.mjs --email "Jane Doe" company.com`
// Prints the LIKELY corporate address formats to try. These are GUESSES —
// always check the person's LinkedIn "Contact info" first; only fall back
// to a guessed pattern for someone already in the loop (e.g. a recruiter).

function guessEmails(fullName, domain) {
  const parts = fullName.trim().toLowerCase().split(/\s+/);
  if (parts.length < 2 || !domain) {
    console.log('Usage: node referrals.mjs --email "First Last" company.com');
    return;
  }
  const f = parts[0];
  const l = parts[parts.length - 1];
  const fi = f[0];
  const li = l[0];
  const d = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const patterns = [
    `${f}.${l}@${d}`,   // jane.doe@   (most common)
    `${f}${l}@${d}`,    // janedoe@
    `${fi}${l}@${d}`,   // jdoe@
    `${f}@${d}`,        // jane@        (smaller cos)
    `${f}_${l}@${d}`,   // jane_doe@
    `${fi}.${l}@${d}`,  // j.doe@
    `${l}${fi}@${d}`,   // doej@
  ];
  console.log(`\nLikely email patterns for ${fullName} @ ${d} (most → least common):\n`);
  patterns.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log(`\n⚠️  These are GUESSES. Before using one:`);
  console.log(`   1. Check the person's LinkedIn "Contact info" — real address beats any guess.`);
  console.log(`   2. For referrals, a LinkedIn message usually outperforms a cold email anyway.`);
  console.log(`   3. If you must guess, send to #1 only; a bounce confirms it's wrong.`);
}

if (EMAIL_IDX !== -1) {
  guessEmails(process.argv[EMAIL_IDX + 1] || '', process.argv[EMAIL_IDX + 2] || '');
  process.exit(0);
}

// ── Pull the strongest opening per company from the leaderboards ─────

function parseLeaderboard(path) {
  if (!existsSync(path)) return [];
  const rows = [];
  for (const m of readFileSync(path, 'utf-8').matchAll(
    /^\| *\d+ *\| *(?:\*\*)?(\d+|—)(?:\*\*)? *\| *(\d+) *\| *([^|]+?) *\| *\[([^\]]+)\]\(([^)]+)\) *\|/gm
  )) {
    rows.push({ ai: m[1] === '—' ? null : +m[1], heur: +m[2], company: m[3].trim(), role: m[4].trim(), url: m[5] });
  }
  return rows;
}

const all = [...parseLeaderboard(BOARD_PATH), ...parseLeaderboard(LINKEDIN_PATH)];
if (!all.length) {
  console.log('No leaderboard found — run node jobs.mjs first.');
  process.exit(0);
}

// Best opening per company (prefer AI score, then heuristic)
const byCompany = new Map();
for (const r of all) {
  const score = r.ai ?? r.heur;
  const cur = byCompany.get(r.company);
  if (!cur || score > (cur.ai ?? cur.heur)) byCompany.set(r.company, r);
}

// Staffing/consulting agencies that pose as employers on LinkedIn — no
// point chasing referrals there. Extend in profile.referral_networks.skip.
const SKIP = new Set([
  'beaconfire', 'synergisticit', 'emonics', 'fantom corporation', 'akina',
  'pragmatike', 'synergy ecp', 'neural earth', 'helic & co.',
  ...(profile.referral_networks?.skip || []).map((s) => s.toLowerCase()),
]);

const isAgency = (name) => {
  const n = name.toLowerCase();
  return [...SKIP].some((s) => n.includes(s));
};

let companies = [...byCompany.values()]
  .filter((r) => (r.ai ?? r.heur) >= minAi && !isAgency(r.company))
  .sort((a, b) => (b.ai ?? b.heur) - (a.ai ?? a.heur))
  .slice(0, argTop);

// ── Build LinkedIn people-search URLs (open these logged in) ─────────

const enc = (s) => encodeURIComponent(s);
// Keyword people-search finds profiles mentioning BOTH terms — reliable and
// login-only (no scraping). network=["S","F"] prioritizes 2nd/1st-degree.
function peopleSearch(terms) {
  const kw = enc(terms.join(' '));
  return `https://www.linkedin.com/search/results/people/?keywords=${kw}&network=%5B%22F%22%2C%22S%22%5D&origin=FACETED_SEARCH`;
}
// School alumni tool, filtered by typing the company in LinkedIn's UI.
function alumniHint(school) {
  const slug = school.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `https://www.linkedin.com/school/${slug}/people/`;
}

// ── Draft a referral message per company (you personalize the [name]) ─

function draftMessage(company, role, viaSchool) {
  const hook = viaSchool
    ? `I'm also a ${viaSchool} grad`
    : `I see you're at ${company} now — I worked with the team at ${exCompanies[0] || 'a shared company'}`;
  return (
    `Hi [first name] — ${hook}, currently finishing my MS CS and looking at the ` +
    `${role} role at ${company}. I build full-stack/backend systems (Node, TypeScript, ` +
    `React, Postgres) — happy to send my resume. Would you be open to a referral or a ` +
    `quick chat about the team? Either way, thanks!`
  ).slice(0, 600);
}

function emailDraft(company, role, viaSchool) {
  const subject = viaSchool
    ? `${viaSchool} grad — quick question about ${company}`
    : `Quick question about ${company} (${role})`;
  const opener = viaSchool
    ? `I'm a fellow ${viaSchool} grad finishing my MS in Computer Science`
    : `we briefly crossed paths at ${exCompanies[0] || 'a previous company'} and I'm finishing my MS in Computer Science`;
  const body =
    `Hi [first name],\n\n` +
    `${opener[0].toUpperCase()}${opener.slice(1)}. I'm applying for the ${role} role at ${company} and ` +
    `wanted to reach out directly.\n\n` +
    `Quick background: I've built and shipped full-stack/backend systems — a real-time MERN ` +
    `platform with role-based access control, an AI code-analysis tool on a BullMQ + pgvector ` +
    `pipeline, and an agentic code-gen system — and I TA the graduate web programming course at ` +
    `Stevens. The ${company} role lines up well with that work.\n\n` +
    `Would you be open to referring me, or pointing me to the right person on the team? Happy to ` +
    `send my resume and a short blurb you can forward. Either way, I appreciate your time.\n\n` +
    `Thanks,\n${myName}`;
  return { subject, body };
}

// mailto: link — opens the user's mail client pre-filled. They add the
// recipient and hit send. No sending happens here.
function mailtoLink(subject, body) {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// ── Write the worksheet ─────────────────────────────────────────────

const date = new Date().toISOString().slice(0, 10);
const out = [
  `# Referral Targets — ${date}`,
  ``,
  `> For each company you want a referral at: open the search links (logged in to LinkedIn),`,
  `> pick 1-3 real people, personalize the draft, and send it yourself. Then log it in`,
  `> \`data/referrals.md\`. Never blast — a personalized note to a few beats a template to many.`,
  ``,
  `**Your networks:** schools = ${schools.join(', ') || '(none set)'} · past companies = ${exCompanies.join(', ') || '(none set)'}`,
  ``,
];

for (const c of companies) {
  const score = c.ai ?? c.heur;
  out.push(`## ${c.company}  ·  best opening: ${score}/100`);
  out.push(`*${c.role}* — [posting](${c.url})`);
  out.push(``);
  out.push(`**Find referrers (open logged in):**`);
  for (const s of schools) {
    out.push(`- ${s} alumni at ${c.company}: [people search](${peopleSearch([c.company, s])})`);
  }
  for (const co of exCompanies) {
    out.push(`- Ex-${co} now at ${c.company}: [people search](${peopleSearch([c.company, co])})`);
  }
  if (schools[0]) out.push(`- (Or use the [${schools[0]} alumni tool](${alumniHint(schools[0])}) → type "${c.company}" in the company filter)`);
  out.push(``);
  out.push(`**LinkedIn DM draft (personalize [first name], ≤300 chars):**`);
  out.push('```');
  out.push(draftMessage(c.company, c.role, schools[0]));
  out.push('```');
  const { subject, body } = emailDraft(c.company, c.role, schools[0]);
  out.push(`**Email draft** — [open in mail app](${mailtoLink(subject, body)}) (add the recipient, then send):`);
  out.push('```');
  out.push(`Subject: ${subject}`);
  out.push(``);
  out.push(body);
  out.push('```');
  out.push(``);
}

writeFileSync(OUT_PATH, out.join('\n'), 'utf-8');

// Initialize the outreach tracker if missing
if (!existsSync('data/referrals.md')) {
  writeFileSync(
    'data/referrals.md',
    `# Referral Outreach Tracker\n\n| Date | Company | Person | Role | Channel | Status | Follow-up due |\n|------|---------|--------|------|---------|--------|---------------|\n`,
    'utf-8'
  );
}

console.log(`✓ ${companies.length} companies → ${OUT_PATH}`);
console.log(`  Log who you contact in data/referrals.md`);
for (const c of companies.slice(0, 8)) console.log(`   ${String(c.ai ?? c.heur).padStart(3)}  ${c.company} — ${c.role}`);
