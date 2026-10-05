#!/usr/bin/env node
/**
 * jobhunt.mjs — one interactive command for the whole job search.
 *
 *   1. Pick a freshness window (filters the ranked view).
 *   2. Scan job boards (scan.mjs — zero tokens).
 *   3. Optionally scan LinkedIn (separate list).
 *   4. Rank everything against your profile; optional Gemini AI scores.
 *
 * Outputs: data/ats-openings.md + data/aggregator-openings.md + data/linkedin-openings.md
 * (+ data/indeed-openings.md when /indeed has been run in Claude Code).
 * Evaluate the leaders inside Claude Code: open `claude` here, say "evaluate top 3".
 *
 * Usage: node jobhunt.mjs   (or: npm link → `jobhunt`)
 */

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { closeSync, readFileSync, existsSync, openSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import yaml from 'js-yaml';

const RUN_LOCK = 'data/.jobhunt.lock';
let runLockFd = null;
function acquireRunLock() {
  try {
    runLockFd = openSync(RUN_LOCK, 'wx');
  } catch (error) {
    if (error.code === 'EEXIST') {
      try {
        const previous = JSON.parse(readFileSync(RUN_LOCK, 'utf-8'));
        let alive = true;
        try { process.kill(Number(previous.pid), 0); } catch { alive = false; }
        if (!alive || Date.now() - statSync(RUN_LOCK).mtimeMs > 6 * 3600000) {
          unlinkSync(RUN_LOCK);
          runLockFd = openSync(RUN_LOCK, 'wx');
        }
      } catch { /* handled below */ }
    }
    if (runLockFd == null) {
      console.error('\nAnother jobhunt pipeline is already running. Wait for it to finish before starting another.');
      process.exit(1);
    }
  }
  writeFileSync(runLockFd, JSON.stringify({ pid: process.pid, started_at: new Date().toISOString() }));
}
function releaseRunLock() {
  if (runLockFd == null) return;
  try { closeSync(runLockFd); } catch { /* already closed */ }
  try { unlinkSync(RUN_LOCK); } catch { /* already removed */ }
  runLockFd = null;
}
acquireRunLock();
process.on('exit', releaseRunLock);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { releaseRunLock(); process.exit(128); });

// Read the AI engine from config so the prompt reflects what actually runs.
let AI_CLI = 'gemini', AI_MODEL = '';
try {
  const cfg = yaml.load(readFileSync('config.yml', 'utf-8'));
  AI_CLI = cfg.ai_cli || 'gemini';
  AI_MODEL = cfg.ai_model || (AI_CLI === 'gemini' ? 'CLI default' : '');
} catch { /* fall back to defaults */ }

const rl = readline.createInterface({ input: stdin, output: stdout });
const stdinClosed = new Promise((res) => rl.once('close', () => res(null)));

function run(cmd, args) {
  // Keep stdin on the CLI so child processes don't swallow the user's answers.
  return spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
}
function requireSuccess(result, label) {
  if (result.status === 0) return;
  console.error(`\n${label} failed; stopping so existing reports are not replaced by a partial run.`);
  rl.close();
  process.exit(result.status || 1);
}
function has(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}
let stdinDone = false;
stdinClosed.then(() => { stdinDone = true; });
async function ask(q, fallback) {
  // Piped input closes stdin after the last line, and rl.question() throws
  // ERR_USE_AFTER_CLOSE from then on. Fall back to the defaults instead, so
  // the pipeline can also be driven non-interactively.
  if (stdinDone) { console.log(`${q}${fallback}`); return fallback; }
  let a;
  try { a = await Promise.race([rl.question(q), stdinClosed]); }
  catch { return fallback; }
  if (a == null || a.trim() === '') return fallback;
  return a.trim();
}

console.log('\n🔎  jobhunt\n');
console.log('How fresh should the ranked list be?');
console.log('(ATS checks active boards; aggregators and decision views use this window.)');
console.log('  1) Last 24 hours   (recommended for your 4–5 daily runs)');
console.log('  2) Last 4 days');
console.log('  3) Last 7 days');
console.log('  4) Last 14 days');
console.log('  5) Everything      (archive inspection; much slower)');
const fresh = await ask('\nChoice [1]: ', '1');
const DAYS = { 1: 1, 2: 4, 3: 7, 4: 14, 5: 0 }[fresh] ?? 1;

const aggAns = (await ask('🌐  Also pull aggregators (SimplifyJobs new-grad + intern, beyond the company list)? (Y/n): ', 'y')).toLowerCase();
const USE_AGG = aggAns !== 'n' && aggAns !== 'no';

const liAns = (await ask('🔗  Also scan LinkedIn? ~3-8 min, separate list (Y/n): ', 'y')).toLowerCase();
const USE_LINKEDIN = liAns !== 'n' && liAns !== 'no';

const aiAns = (await ask(`✨  Add AI-fit scores? (${AI_MODEL || AI_CLI}, cached) (Y/n): `, 'y')).toLowerCase();
let USE_AI = aiAns !== 'n' && aiAns !== 'no';
if (USE_AI && !has(AI_CLI)) {
  console.log(`   ('${AI_CLI}' CLI not found — skipping AI scores. Set ai_cli/ai_model in config.yml.)`);
  USE_AI = false;
}

console.log('\n📡  Scanning job boards…\n');
requireSuccess(run('node', ['scan.mjs']), 'ATS scan');

if (USE_AGG) {
  console.log('\n🌐  Pulling aggregators…\n');
  requireSuccess(run('node', ['aggregators.mjs', '--days', String(DAYS)]), 'Aggregator scan');
}

if (USE_LINKEDIN) {
  console.log('\n🔗  Scanning LinkedIn incrementally…\n');
  requireSuccess(run('node', ['linkedin.mjs']), 'LinkedIn scan');
}

// Indeed can't be fetched from Node (Cloudflare) — the scan runs through the
// Indeed MCP connector via the /indeed skill in Claude Code. rank.mjs below
// picks up whatever data/indeed-jds.json already contains.
const HAS_INDEED = existsSync('data/indeed-jds.json');
if (HAS_INDEED) {
  const last = statSync('data/indeed-jds.json').mtime.toISOString().slice(0, 10);
  console.log(`\n🟦  Indeed last imported ${last} — refresh with /indeed inside Claude Code.`);
} else {
  console.log('\n🟦  Tip: scan Indeed too — run /indeed inside Claude Code (needs the Indeed connector).');
}

console.log('\n📊  Ranking against your profile…\n');
const rankArgs = ['rank.mjs'];
if (DAYS > 0) rankArgs.push('--days', String(DAYS));
if (USE_AI) rankArgs.push('--ai');
const rankResult = run('node', rankArgs);
requireSuccess(rankResult, 'Ranking');
console.log('');
requireSuccess(run('node', ['board-recent.mjs', '--days', String(DAYS)]), 'ATS/aggregator recent-view build');

// LinkedIn recent is intentionally always a 24-hour decision view. The
// freshness choice above controls aggregator discovery and ATS/aggregator recent views.
const HAS_LINKEDIN = existsSync('data/linkedin-jds.json');
if (HAS_LINKEDIN) {
  console.log('');
  run('node', ['linkedin-recent.mjs', '--days', '1']);
}

// The point of the run is the apply list, so print it here instead of making
// the user open a file to find out whether anything came up.
console.log('\n' + '─'.repeat(70));
run('node', ['today.mjs']);
console.log('─'.repeat(70));

console.log('\n✅  Done — your ranked lists:');
console.log('    • data/ats-openings.md        (ATS boards)');
console.log('    • data/aggregator-openings.md (aggregators)');
console.log('    • data/ats-recent.md          (ATS decision view)');
console.log('    • data/aggregator-recent.md   (aggregator decision view)');
if (HAS_LINKEDIN) {
  console.log('    • data/linkedin-openings.md  (LinkedIn — full list)');
  console.log('    • data/linkedin-recent.md    (LinkedIn — last 24h decision view, replaced each run)');
}
if (HAS_INDEED) console.log('    • data/indeed-openings.md    (Indeed — via /indeed in Claude Code)');
console.log('\nNext:');
console.log('    • Your to-do today:      node today.mjs');
console.log('    • Evaluate the leaders:  open `claude` here → "evaluate top 3"');
console.log('    • Find referrers:        node referrals.mjs');
console.log('    • Check a JD fit:        node keywords.mjs <url>');

rl.close();
