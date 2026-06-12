#!/usr/bin/env node
/**
 * rank.mjs — score openings against your profile (zero tokens by default).
 *
 * Heuristic 0–100 (company tier + title fit + location + skill overlap +
 * experience ask + sponsorship language + posted salary + freshness), plus an
 * optional Gemini AI score (--ai) that reads the full JD vs your resume.
 *
 * Two separate lists (LinkedIn is noisier, kept apart):
 *   data/top-openings.md       ← job boards (from data/pipeline.md)
 *   data/linkedin-openings.md  ← LinkedIn (from data/linkedin-jds.json)
 *
 * Usage:
 *   node rank.mjs                 # heuristic only
 *   node rank.mjs --ai            # + Gemini scores (free tier, cached)
 *   node rank.mjs --days 7        # only openings posted in the last 7 days
 *   node rank.mjs --top 30        # size of the apply-first table
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { spawnSync } from 'node:child_process';
import yaml from 'js-yaml';

const CONFIG_PATH = 'config.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const LINKEDIN_JDS = 'data/linkedin-jds.json';
const BOARD_OUT = 'data/top-openings.md';
const LINKEDIN_OUT = 'data/linkedin-openings.md';
const AI_CACHE_PATH = 'data/ai-scores.json';
const AI_THRESHOLD = 65;

const TOP_N = (() => { const i = process.argv.indexOf('--top'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 30 : 30; })();
const MAX_DAYS = (() => { const i = process.argv.indexOf('--days'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || null : null; })();
const USE_AI = process.argv.includes('--ai');

const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));
const profile = config.profile || {};
const tierByCompany = new Map((config.companies || []).map((c) => [c.name.toLowerCase(), c.tier || 3]));

const splitSkill = (s) => String(s).split('/').map((x) => x.replace(/\(.*?\)/g, '').trim().toLowerCase()).filter((x) => x.length > 2);
const expertSkills = (profile.core_stack?.expert || []).flatMap(splitSkill);
const strongSkills = (profile.core_stack?.strong || []).flatMap(splitSkill);

// ── HTTP + text helpers ─────────────────────────────────────────────

async function fetchJson(url, timeoutMs = 30000, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'jobhunt/1.0' }, ...opts });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const stripHtml = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

// ── Parse pipeline + history ────────────────────────────────────────

function parsePipeline() {
  if (!existsSync(PIPELINE_PATH)) return [];
  const out = [];
  for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/^- \[ \] (https?:\/\/\S+) \| ([^|]+) \| (.+)$/gm))
    out.push({ url: m[1], company: m[2].trim(), title: m[3].trim() });
  return out;
}

function parseHistory() {
  const byUrl = new Map();
  if (!existsSync(HISTORY_PATH)) return byUrl;
  for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
    const c = line.split('\t');
    if (c[0]) byUrl.set(c[0], { first_seen: c[1] || '', location: c[6] || '' });
  }
  return byUrl;
}

// ── Board description fetch (greenhouse/ashby/lever) ─────────────────

function boardApiFor(entry) {
  const url = entry.careers_url || '';
  let m;
  if ((m = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)))
    return { type: 'greenhouse', api: `https://boards-api.greenhouse.io/v1/boards/${m[1]}/jobs?content=true` };
  if ((m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)/)))
    return { type: 'ashby', api: `https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true` };
  if ((m = url.match(/jobs\.lever\.co\/([^/?#]+)/)))
    return { type: 'lever', api: `https://api.lever.co/v0/postings/${m[1]}?mode=json` };
  return null;
}

async function fetchDescriptions() {
  const byUrl = new Map();
  const queue = (config.companies || []).filter((c) => c.enabled !== false)
    .map((c) => ({ c, board: boardApiFor(c) })).filter((x) => x.board);
  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { board } = queue[idx++];
      try {
        const json = await fetchJson(board.api);
        if (board.type === 'greenhouse')
          for (const j of json.jobs || []) byUrl.set(j.absolute_url, { desc: stripHtml(j.content || ''), comp: null, posted: j.first_published || j.updated_at || null });
        else if (board.type === 'ashby')
          for (const j of json.jobs || []) byUrl.set(j.jobUrl, { desc: stripHtml(j.descriptionHtml || j.description || ''), comp: j.compensation?.compensationTierSummary || null, posted: j.publishedAt || null });
        else if (board.type === 'lever')
          for (const j of json || []) byUrl.set(j.hostedUrl, { desc: stripHtml(j.descriptionPlain || ''), comp: null, posted: j.createdAt || null });
      } catch { /* board down — score on title/location */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return byUrl;
}

// Workday has no board-level description feed — fetch per-job details (capped).
async function addWorkdayDescriptions(entries, byUrl) {
  const todo = entries.map((e) => {
    const m = e.url.match(/^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/[a-z]{2}-[A-Z]{2}\/([^/]+)(\/job\/.+)$/);
    return m && !byUrl.has(e.url) ? { url: e.url, cxs: `https://${m[1]}.${m[2]}.myworkdayjobs.com/wday/cxs/${m[1]}/${m[3]}${m[4]}` } : null;
  }).filter(Boolean).slice(0, 60);
  if (!todo.length) return;
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const t = todo[idx++];
      try {
        const json = await fetchJson(t.cxs, 20000);
        const info = json?.jobPostingInfo;
        byUrl.set(t.url, { desc: stripHtml(info?.jobDescription || ''), comp: null, posted: info?.startDate || null });
      } catch { /* fall back */ }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
}

function loadLinkedinEntries() {
  try {
    const cache = JSON.parse(readFileSync(LINKEDIN_JDS, 'utf-8'));
    return Object.entries(cache).map(([url, j]) => ({ url, company: j.company || 'Unknown', title: j.title || '', location: j.location || '', desc: j.desc || '', comp: null, postedRaw: j.posted || null }));
  } catch { return []; }
}

// ── Heuristic scoring ───────────────────────────────────────────────

const NEG_SPONSOR = ['unable to sponsor', 'cannot sponsor', 'will not sponsor', 'not able to sponsor', 'no visa sponsorship', 'without sponsorship', 'sponsorship is not available', 'not provide sponsorship', 'not offer sponsorship', 'us citizenship required', 'must be a us citizen', 'security clearance', 'citizenship is required'];
const POS_SPONSOR = ['sponsorship available', 'we sponsor', 'visa sponsorship', 'h-1b', 'h1b', 'opt'];

function scoreEntry(e) {
  const title = e.title.toLowerCase();
  const loc = (e.location || '').toLowerCase();
  const desc = (e.desc || '').toLowerCase();
  let score = 30;
  const flags = [];

  const tier = tierByCompany.get(e.company.toLowerCase());
  if (tier === 1) score += 14; else if (tier === 2) score += 9; else if (tier === 3) score += 5;

  if (/new grad|university grad|early career|entry.level|recent grad|engineer i\b|swe i\b|engineer 1\b/.test(title)) { score += 20; flags.push('🎓 new-grad'); }
  if (/intern/.test(title) && !/internal/.test(title)) { score += 16; flags.push('🎓 intern'); }
  if (/backend|back-end|server/.test(title)) score += 10;
  else if (/full.stack/.test(title)) score += 10;
  else if (/\bai\b|machine learning|\bml\b|llm/.test(title)) score += 7;
  else if (/platform|infra|devtools|developer (experience|productivity)/.test(title)) score += 5;
  else if (/frontend|front-end/.test(title)) score -= 4;
  if (/sdet|test|quality/.test(title)) score -= 8;
  if (!/engineer|developer|swe|sde|intern|scientist/.test(title)) score -= 20;

  if (/new york|nyc|hoboken|jersey city|brooklyn/.test(loc)) { score += 12; flags.push('🗽 NY'); }
  else if (/remote/.test(loc)) score += 8;
  else if (/san francisco|seattle|boston|bay area/.test(loc)) score += 6;
  else if (loc) score += 2;

  if (desc) {
    let exp = 0, str = 0;
    for (const s of expertSkills) if (desc.includes(s)) exp += 2;
    for (const s of strongSkills) if (desc.includes(s)) str += 1;
    score += Math.min(exp, 12) + Math.min(str, 6);

    let maxYears = 0;
    for (const m of desc.matchAll(/(\d{1,2})\s*\+?\s*(?:years?|yrs?)\b/g)) { const n = parseInt(m[1], 10); if (n > maxYears && n <= 20) maxYears = n; }
    if (maxYears >= 5) { score -= 25; flags.push(`⏳ ${maxYears}y ask`); }
    else if (maxYears >= 3) { score -= 12; flags.push(`⏳ ${maxYears}y ask`); }
    if (/new grad|recent graduate|graduating in|no prior experience/.test(desc)) score += 6;

    if (NEG_SPONSOR.some((p) => desc.includes(p))) { score -= 35; flags.push('⚠️ no-sponsor'); }
    else if (POS_SPONSOR.some((p) => desc.includes(p))) { score += 5; flags.push('✅ sponsors'); }

    const sal = desc.match(/\$\s?(\d{2,3})[,.]?\d{3}/g);
    if (sal) {
      const nums = sal.map((s) => parseInt(s.replace(/[^\d]/g, ''), 10)).filter((n) => n >= 60000 && n <= 900000);
      if (nums.length) {
        const max = Math.max(...nums);
        e.salary = `$${Math.round(Math.min(...nums) / 1000)}k–$${Math.round(max / 1000)}k`;
        if (max >= 130000) score += 4; else if (max >= 110000) score += 2;
      }
    }
  } else { flags.push('· no JD text'); }
  if (e.comp && !e.salary) e.salary = e.comp;

  if (e.daysAgo !== null && e.daysAgo !== undefined) {
    if (e.daysAgo <= 7) { score += 4; flags.push('🆕'); }
    else if (e.daysAgo <= 14) score += 2;
    else if (e.daysAgo > 180) { score -= 6; flags.push('📅 evergreen'); }
  }

  e.score = Math.max(0, Math.min(100, Math.round(score)));
  e.flags = flags;
  return e;
}

function parsePosted(raw) {
  if (raw == null) return null;
  const d = typeof raw === 'number' ? new Date(raw) : new Date(String(raw));
  return isNaN(d.getTime()) ? null : d;
}

// ── Gemini AI scoring (free tier CLI, cached) ───────────────────────

function loadAiCache() { try { return JSON.parse(readFileSync(AI_CACHE_PATH, 'utf-8')); } catch { return {}; } }

function geminiScoreBatch(batch, resume) {
  const prompt = [
    `You are an expert Engineering Manager hiring for Entry-Level Software Engineers, New Grads, and SWE Interns.`,
    `Score each job below against the candidate resume as an integer 0-100:`,
    `- Skills overlap (general-purpose languages, DSA, distributed systems, cloud/Docker): 40`,
    `- Relevant experience (internships, TA roles, complex academic/personal projects): 25`,
    `- Responsibilities alignment (junior/entry-level tasks): 15`,
    `- Education fit (roles targeting active Master's students or recent MSCS grads): 10`,
    `- Domain/industry fit: 5`,
    `- Logistics: 5`,
    `CRITICAL: deduct up to 30 points if the role strictly requires 3+ years of full-time industry experience or is mid/senior.`,
    `Candidate is F-1, OPT from May 2026: deduct 40 points if the JD says no visa sponsorship / US citizenship / clearance required.`,
    ``, `RESUME:`, resume, ``, `JOBS:`,
    batch.map((e, i) => `[${i}] ${e.company} — ${e.title}\n${(e.desc || '(no description available)').slice(0, 3500)}`).join('\n\n---\n\n'),
    ``, `Return ONLY a JSON array, one element per job index, no prose:`,
    `[{"i":0,"score":NN,"reason":"<max 12 words>"}, ...]`,
  ].join('\n');
  const r = spawnSync('gemini', ['-p', prompt], { encoding: 'utf-8', timeout: 240000 });
  const m = `${r.stdout || ''}`.match(/\[[\s\S]*\]/);
  if (!m) throw new Error(`gemini gave no JSON (exit ${r.status})`);
  return JSON.parse(m[0]);
}

function aiScore(entries, threshold) {
  const cache = loadAiCache();
  const todo = entries.filter((e) => e.score >= threshold && !cache[e.url]);
  console.log(`\n🤖  Gemini AI scoring: ${todo.length} new openings${threshold > 0 ? ` ≥${threshold}` : ''} (cached: ${Object.keys(cache).length})`);
  if (todo.length) {
    const resume = readFileSync('cv.md', 'utf-8').slice(0, 6000);
    const BATCH = 5;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      process.stdout.write(`   batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)}… `);
      try {
        for (const row of geminiScoreBatch(batch, resume)) {
          const e = batch[row.i];
          if (e && Number.isFinite(row.score)) cache[e.url] = { score: Math.max(0, Math.min(100, Math.round(row.score))), reason: String(row.reason || '').slice(0, 80), date: new Date().toISOString().slice(0, 10) };
        }
        console.log('ok');
      } catch (err) { console.log(`failed (${err.message.split('\n')[0]}) — heuristic still applies`); }
      writeFileSync(AI_CACHE_PATH, JSON.stringify(cache, null, 1), 'utf-8');
    }
  }
  for (const e of entries) { const c = cache[e.url]; if (c) { e.ai = c.score; e.aiReason = c.reason; } }
}

// ── Render ──────────────────────────────────────────────────────────

const now = Date.now();
const fmtPosted = (e) => (e.postedDate ? `${e.postedDate.toISOString().slice(0, 10)} (${e.daysAgo}d)` : '—');

function applyDaysFilter(list, label) {
  if (MAX_DAYS === null) return list;
  const kept = list.filter((e) => e.daysAgo !== null && e.daysAgo <= MAX_DAYS);
  console.log(`--days ${MAX_DAYS}: ${kept.length} of ${list.length} ${label} openings posted in the last ${MAX_DAYS} days`);
  return kept;
}

function sortRanked(list) {
  const key = (e) => (e.ai ?? e.score);
  list.sort((a, b) => key(b) - key(a) || b.score - a.score || (a.daysAgo ?? 999) - (b.daysAgo ?? 999));
  return list;
}

function renderLeaderboard(ranked, outPath, title, aiNote) {
  const date = new Date().toISOString().slice(0, 10);
  const top = ranked.slice(0, TOP_N);
  const lines = [
    `# ${title}`, ``,
    `> Generated ${date} · ${ranked.length} openings scored${MAX_DAYS !== null ? ` (last ${MAX_DAYS} days)` : ''}`,
    `> Score /100: heuristic — company tier + title fit + location (NY first) + skill overlap + experience ask + sponsorship + salary + freshness.`,
    `> AI /100: Gemini reads the full JD vs your resume. ${aiNote} 💬 = Gemini's one-line reason.`,
    `> ⚠️ no-sponsor = JD says no visa sponsorship / citizenship — skip. 🆕 = posted ≤7 days · 📅 evergreen = 6+ months old.`,
    ``, `## Apply-first list (top ${top.length})`, ``,
    `| # | AI | Score | Company | Role | Location | Posted | Salary | Signals |`,
    `|---|----|-------|---------|------|----------|--------|--------|---------|`,
  ];
  top.forEach((e, i) => {
    const signals = [e.flags.join(' '), e.aiReason ? `💬 ${e.aiReason}` : ''].filter(Boolean).join(' ') || '—';
    lines.push(`| ${i + 1} | ${e.ai != null ? `**${e.ai}**` : '—'} | ${e.score} | ${e.company} | [${e.title}](${e.url}) | ${e.location || '—'} | ${fmtPosted(e)} | ${e.salary || '—'} | ${signals} |`);
  });
  lines.push(``, `## Full ranking`, ``, `| AI | Score | Company | Role | Location | Posted |`, `|----|-------|---------|------|----------|--------|`);
  for (const e of ranked.slice(TOP_N))
    lines.push(`| ${e.ai ?? '—'} | ${e.score} | ${e.company} | [${e.title}](${e.url}) | ${e.location || '—'} | ${fmtPosted(e)} |`);
  lines.push(``);
  writeFileSync(outPath, lines.join('\n'), 'utf-8');
  console.log(`\n${title} — top ${Math.min(10, top.length)}:`);
  for (const e of top.slice(0, 10))
    console.log(`  ${e.ai != null ? `AI:${String(e.ai).padStart(3)}` : '      '} h:${String(e.score).padStart(3)}  ${e.company} — ${e.title}  [${e.location || '?'}] ${fmtPosted(e)} ${e.flags.join(' ')}`);
  console.log(`→ ${outPath}`);
}

// ── Main ────────────────────────────────────────────────────────────

const board = parsePipeline();
if (board.length) {
  console.log(`Ranking ${board.length} board openings…`);
  const history = parseHistory();
  const descriptions = await fetchDescriptions();
  await addWorkdayDescriptions(board, descriptions);
  for (const e of board) {
    const h = history.get(e.url);
    e.location = h?.location || '';
    const d = descriptions.get(e.url);
    e.desc = d?.desc || ''; e.comp = d?.comp || null;
    e.postedDate = parsePosted(d?.posted) || parsePosted(h?.first_seen);
    e.daysAgo = e.postedDate ? Math.floor((now - e.postedDate.getTime()) / 86400000) : null;
    scoreEntry(e);
  }
  const ranked = applyDaysFilter(board, 'board');
  if (USE_AI) aiScore(ranked, AI_THRESHOLD);
  sortRanked(ranked);
  renderLeaderboard(ranked, BOARD_OUT, 'Top Openings — job boards', `Only computed for heuristic ≥${AI_THRESHOLD}.`);
} else {
  console.log('No board openings in data/pipeline.md — run node scan.mjs first.');
}

const li = loadLinkedinEntries();
if (li.length) {
  console.log(`\nRanking ${li.length} LinkedIn openings…`);
  for (const e of li) {
    e.postedDate = parsePosted(e.postedRaw);
    e.daysAgo = e.postedDate ? Math.floor((now - e.postedDate.getTime()) / 86400000) : null;
    scoreEntry(e);
  }
  // LinkedIn list stays FULL (no --days filter) — the windowed view lives in
  // its own file via linkedin-recent.mjs, so this list is always complete.
  const ranked = li;
  if (USE_AI) aiScore(ranked, 0);
  sortRanked(ranked);
  renderLeaderboard(ranked, LINKEDIN_OUT, 'Top Openings — LinkedIn', 'Computed for ALL LinkedIn jobs (no title filter — Gemini judges the JD).');
}
