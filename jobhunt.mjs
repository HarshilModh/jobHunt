#!/usr/bin/env node
/**
 * jobhunt.mjs — one interactive command for the whole job search.
 *
 *   1. Pick a freshness window (filters the ranked view).
 *   2. Scan job boards (scan.mjs — zero tokens).
 *   3. Optionally scan LinkedIn (separate list).
 *   4. Rank everything against your profile; optional Gemini AI scores.
 *
 * Outputs: data/top-openings.md (boards) + data/linkedin-openings.md.
 * Evaluate the leaders inside Claude Code: open `claude` here, say "evaluate top 3".
 *
 * Usage: node jobhunt.mjs   (or: npm link → `jobhunt`)
 */

import readline from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import yaml from 'js-yaml';

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
function has(cmd) {
  return spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;
}
async function ask(q, fallback) {
  const a = await Promise.race([rl.question(q), stdinClosed]);
  if (a == null || a.trim() === '') return fallback;
  return a.trim();
}

console.log('\n🔎  jobhunt\n');
console.log('How fresh should the ranked list be?');
console.log('(Filters the VIEW only — the scan always collects everything.)');
console.log('  1) Last 24 hours   (short — only posted yesterday)');
console.log('  2) Last 4 days');
console.log('  3) Last 7 days');
console.log('  4) Last 14 days');
console.log('  5) Everything      (recommended for the first run of the day)');
const fresh = await ask('\nChoice [5]: ', '5');
const DAYS = { 1: 1, 2: 4, 3: 7, 4: 14, 5: 0 }[fresh] ?? 0;

const liAns = (await ask('🔗  Also scan LinkedIn? ~3-8 min, separate list (Y/n): ', 'y')).toLowerCase();
const USE_LINKEDIN = liAns !== 'n' && liAns !== 'no';

const aiAns = (await ask(`✨  Add AI-fit scores? (${AI_MODEL || AI_CLI}, cached) (Y/n): `, 'y')).toLowerCase();
let USE_AI = aiAns !== 'n' && aiAns !== 'no';
if (USE_AI && !has(AI_CLI)) {
  console.log(`   ('${AI_CLI}' CLI not found — skipping AI scores. Set ai_cli/ai_model in config.yml.)`);
  USE_AI = false;
}

console.log('\n📡  Scanning job boards…\n');
run('node', ['scan.mjs']);

if (USE_LINKEDIN) {
  console.log('\n🔗  Scanning LinkedIn…\n');
  run('node', ['linkedin.mjs', '--hours', String((DAYS || 7) * 24)]);
}

console.log('\n📊  Ranking against your profile…\n');
const rankArgs = ['rank.mjs'];
if (DAYS > 0) rankArgs.push('--days', String(DAYS));
if (USE_AI) rankArgs.push('--ai');
run('node', rankArgs);

// Windowed LinkedIn snapshot (replaced each run) for the freshness you picked.
// "Everything" (DAYS=0) still produces a 24-hour recent view.
const RECENT_DAYS = DAYS > 0 ? DAYS : 1;
if (USE_LINKEDIN) {
  console.log('');
  run('node', ['linkedin-recent.mjs', '--days', String(RECENT_DAYS)]);
}

console.log('\n✅  Done — your ranked lists:');
console.log('    • data/top-openings.md       (job boards)');
if (USE_LINKEDIN) {
  console.log('    • data/linkedin-openings.md  (LinkedIn — full list)');
  console.log(`    • data/linkedin-recent.md    (LinkedIn — ${RECENT_DAYS === 1 ? 'last 24h' : `last ${RECENT_DAYS}d`}, replaced each run)`);
}
console.log('\nNext:');
console.log('    • Your to-do today:      node today.mjs');
console.log('    • Evaluate the leaders:  open `claude` here → "evaluate top 3"');
console.log('    • Find referrers:        node referrals.mjs');
console.log('    • Check a JD fit:        node keywords.mjs <url>');

rl.close();
