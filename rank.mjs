#!/usr/bin/env node
/**
 * rank.mjs — score openings against your profile (zero tokens by default).
 *
 * Heuristic 0–100 (company tier + title fit + location + skill overlap +
 * experience ask + sponsorship language + posted salary + freshness), plus an
 * optional Gemini AI score (--ai) that reads the full JD vs your resume.
 *
 * Four separate lists:
 *   data/ats-openings.md         ← ATS boards (greenhouse, ashby, lever, etc.)
 *   data/aggregator-openings.md  ← aggregators (simplify, jobright, speedyapply, etc.)
 *   data/linkedin-openings.md    ← LinkedIn (from data/linkedin-jds.json)
 *   data/indeed-openings.md      ← Indeed (from data/indeed-jds.json, via /indeed)
 *
 * Usage:
 *   node rank.mjs                 # heuristic only
 *   node rank.mjs --ai            # + Gemini scores (free tier, cached)
 *   node rank.mjs --days 7        # only openings posted in the last 7 days
 *   node rank.mjs --top 30        # size of the apply-first table
 */

import { readFileSync, writeFileSync, existsSync, renameSync } from 'fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import yaml from 'js-yaml';
import { canonicalJobKey, loadBoardStore, sourceQualityFor } from './board-store.mjs';

const CONFIG_PATH = 'config.yml';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const LINKEDIN_JDS = 'data/linkedin-jds.json';
const INDEED_JDS = 'data/indeed-jds.json';
const ATS_OUT = 'data/ats-openings.md';
const AGG_OUT = 'data/aggregator-openings.md';
const ATS_RANKED_OUT = 'data/ats-ranked.json';
const AGG_RANKED_OUT = 'data/aggregator-ranked.json';
const LINKEDIN_OUT = 'data/linkedin-openings.md';
const LINKEDIN_RANKED_OUT = 'data/linkedin-ranked.json';
const INDEED_OUT = 'data/indeed-openings.md';
const AI_CACHE_PATH = 'data/ai-scores.json';
// Score every job that has JD text, same as the LinkedIn/Indeed lanes. The old
// heuristic-≥65 gate meant fresh ATS/aggregator rows (typically 40–62) were
// never sent to the AI, so the decision views were full of "AI fit not scored
// yet". NEW_AI_CAP keeps an unwindowed "Everything" run from ballooning.
const AI_THRESHOLD = 0;

const TOP_N = (() => { const i = process.argv.indexOf('--top'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || 30 : 30; })();
const MAX_DAYS = (() => { const i = process.argv.indexOf('--days'); return i !== -1 ? parseInt(process.argv[i + 1], 10) || null : null; })();
const USE_AI = process.argv.includes('--ai');
const REFRESH_AI = process.argv.includes('--refresh-ai');
const AI_PROMPT_VERSION = 2;
function writeAtomic(path, content) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf-8');
  renameSync(temp, path);
}

const config = yaml.load(readFileSync(CONFIG_PATH, 'utf-8'));

// Past this age an ATS posting is treated as an evergreen req: still shown,
// still scored, but demoted out of "Apply first".
const EVERGREEN_DAYS = Number(config.evergreen_days ?? 60);
// Apply-first needs AI ≥ 70 *and* a heuristic at least this high — see the
// AI-only guard in analyzeDecision. Lower it to let more borderline rows
// through; raise it if AI-inflated no-name postings start leading the list.
const HEURISTIC_FLOOR = Number(config.apply_heuristic_floor ?? 55);
const profile = config.profile || {};
const tierByCompany = new Map((config.companies || []).map((c) => [c.name.toLowerCase(), c.tier || 3]));
// Per-company H-1B sponsorship signal (config.sponsors). Substring match.
const sponsorEntries = Object.entries(config.sponsors || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]);
function companySponsors(company) {
  const c = company.toLowerCase();
  for (const [k, v] of sponsorEntries) if (c.includes(k)) return v;
  return null;
}
// Reposters and legitimate staffing firms are different risk classes. Both
// stay discoverable, but neither is allowed to outrank a direct employer just
// because an AI scorer liked the copied JD.
const reposters = (config.company_blocklist || []).map((k) => String(k).toLowerCase());
const staffingAgencies = (config.staffing_agencies || []).map((k) => String(k).toLowerCase());
const matchesCompanyList = (company, list) => {
  const c = String(company || '').toLowerCase();
  return list.some((k) => c.includes(k));
};
const isReposter = (company) => matchesCompanyList(company, reposters);
// The named list can't keep up with the long tail of recruiting shops, so also
// catch the ones that say so in their name (Prosum, Initi8 Recruitment, …).
const STAFFING_NAME_RE = /\b(?:recruit(?:ing|ment|ers?)?|staffing|talent (?:solutions|partners|group)|search (?:group|partners)|consultanc(?:y|ies)|headhunt\w*)\b/i;
const isStaffing = (company) => matchesCompanyList(company, staffingAgencies) || STAFFING_NAME_RE.test(String(company || ''));
const isReposterEntry = (entry) => entry?._sourceQuality === 'reposter' || isReposter(entry?.company);
const isStaffingEntry = (entry) => entry?._sourceQuality === 'staffing' || isStaffing(entry?.company);
const isSuppressedSource = (entry) => isReposterEntry(entry) || isStaffingEntry(entry);

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

function parsePipeline(history, store) {
  if (!existsSync(PIPELINE_PATH)) return [];
  const byKey = new Map();
  let rawCount = 0, orphanCount = 0;
  for (const m of readFileSync(PIPELINE_PATH, 'utf-8').matchAll(/^- \[ \] (https?:\/\/\S+) \| ([^|]+) \| (.+)$/gm)) {
    rawCount++;
    const url = m[1], company = m[2].trim(), title = m[3].trim();
    const key = canonicalJobKey(url, company);
    const h = history.byUrl.get(url) || history.byKey.get(key) || {};
    const record = store.jobs[key];
    // pipeline.md is append-only and predates board-jobs.json. Rows with no
    // store record carry no JD, no posting date, and no lane — they can never
    // be AI-scored or dated, so they only pad the "review" pile. Skip them;
    // any posting still live on a board is re-persisted by the next scan.
    if (!record) { orphanCount++; continue; }
    const candidate = {
      url: record.url || url,
      company: record.company || company,
      title: record.title || title,
      _key: key,
      _record: record,
      _history: h,
      _portal: record.source || h.portal || '',
      _lane: record.lane || (String(record.source || h.portal || '').endsWith('-api') ? 'ats' : 'aggregator'),
      _sourceQuality: record.source_quality || sourceQualityFor({ company: record.company || company, source: record.source || h.portal || '', url: record.url || url }, reposters, staffingAgencies),
    };
    const existing = byKey.get(key);
    if (!existing) byKey.set(key, candidate);
    else {
      const priority = (entry) => [
        entry._lane === 'ats' ? 0 : 1,
        entry._sourceQuality === 'direct' ? 0 : entry._sourceQuality === 'direct/unknown' ? 1 : 2,
        entry._record?.description ? 0 : 1,
        entry.url.length,
      ];
      const a = priority(existing), b = priority(candidate);
      let takeCandidate = false;
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) { takeCandidate = b[i] < a[i]; break; }
      }
      if (takeCandidate) byKey.set(key, candidate);
    }
  }
  const out = [...byKey.values()];
  out.rawCount = rawCount;
  out.orphanCount = orphanCount;
  return out;
}

function parseHistory() {
  const byUrl = new Map(), byKey = new Map();
  if (!existsSync(HISTORY_PATH)) return { byUrl, byKey };
  for (const line of readFileSync(HISTORY_PATH, 'utf-8').split('\n').slice(1)) {
    const c = line.split('\t');
    if (c[0]) {
      const record = { first_seen: c[1] || '', portal: c[2] || '', location: c[6] || '' };
      byUrl.set(c[0], record);
      const key = canonicalJobKey(c[0], c[4] || '');
      if (!byKey.has(key)) byKey.set(key, record);
    }
  }
  return { byUrl, byKey };
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
  const byKey = new Map();
  const queue = (config.companies || []).filter((c) => c.enabled !== false)
    .map((c) => ({ c, board: boardApiFor(c) })).filter((x) => x.board);
  let idx = 0;
  async function worker() {
    while (idx < queue.length) {
      const { board, c } = queue[idx++];
      try {
        const json = await fetchJson(board.api);
        if (board.type === 'greenhouse')
          for (const j of json.jobs || []) byKey.set(canonicalJobKey(j.absolute_url, c.name), { desc: stripHtml(j.content || ''), comp: null, posted: j.first_published || null, postedPrecision: j.first_published ? 'timestamp' : 'unknown' });
        else if (board.type === 'ashby')
          for (const j of json.jobs || []) byKey.set(canonicalJobKey(j.jobUrl, c.name), { desc: stripHtml(j.descriptionHtml || j.description || ''), comp: j.compensation?.compensationTierSummary || null, posted: j.publishedAt || null, postedPrecision: 'timestamp' });
        else if (board.type === 'lever')
          for (const j of json || []) byKey.set(canonicalJobKey(j.hostedUrl, c.name), { desc: stripHtml(j.descriptionPlain || ''), comp: null, posted: j.createdAt || null, postedPrecision: 'timestamp' });
      } catch { /* board down — score on title/location */ }
    }
  }
  await Promise.all(Array.from({ length: 6 }, worker));
  return byKey;
}

// Workday has no board-level description feed — fetch per-job details (capped).
async function addWorkdayDescriptions(entries, byKey) {
  const ordered = [...entries].sort((a, b) => {
    const da = Date.parse(a._record?.source_posted_at || a._record?.discovered_at || a._history?.first_seen || 0) || 0;
    const db = Date.parse(b._record?.source_posted_at || b._record?.discovered_at || b._history?.first_seen || 0) || 0;
    return db - da;
  });
  const todo = ordered.map((e) => {
    const m = e.url.match(/^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/]+)(\/job\/.+)$/i);
    return m && !byKey.has(e._key) ? { key: e._key, cxs: `https://${m[1]}.${m[2]}.myworkdayjobs.com/wday/cxs/${m[1]}/${m[3]}${m[4]}` } : null;
  }).filter(Boolean).slice(0, Number(config.workday_detail_cap ?? 120));
  if (!todo.length) return;
  let idx = 0;
  async function worker() {
    while (idx < todo.length) {
      const t = todo[idx++];
      try {
        const json = await fetchJson(t.cxs, 20000);
        const info = json?.jobPostingInfo;
        byKey.set(t.key, { desc: stripHtml(info?.jobDescription || ''), comp: null, posted: info?.startDate || null, postedPrecision: 'date' });
      } catch { /* fall back */ }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker));
}

// Aggregator feeds often link straight to a supported ATS but do not include
// the JD. Fetch each recent board once and key jobs canonically so URL variants
// still receive the description, posting date, and sponsorship checks.
async function addAggregatorBoardDescriptions(entries, byKey) {
  const scopeDays = MAX_DAYS ?? 7;
  const cutoff = Date.now() - scopeDays * 86400000;
  const boards = new Map();
  for (const entry of entries) {
    if (entry._lane !== 'aggregator' || byKey.has(entry._key) || entry._sourceQuality === 'reposter') continue;
    const observed = Date.parse(entry._record?.source_posted_at || entry._record?.discovered_at || entry._history?.first_seen || 0);
    if (!observed || observed < cutoff - 86400000) continue;
    let match, type, api;
    if ((match = entry.url.match(/https:\/\/(?:job-boards(?:\.eu)?|boards)\.greenhouse\.io\/([^/?#]+)/i))) {
      type = 'greenhouse'; api = `https://boards-api.greenhouse.io/v1/boards/${match[1]}/jobs?content=true`;
    } else if ((match = entry.url.match(/https:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i))) {
      type = 'ashby'; api = `https://api.ashbyhq.com/posting-api/job-board/${match[1]}?includeCompensation=true`;
    } else if ((match = entry.url.match(/https:\/\/jobs\.lever\.co\/([^/?#]+)/i))) {
      type = 'lever'; api = `https://api.lever.co/v0/postings/${match[1]}?mode=json`;
    }
    if (api && !boards.has(api)) boards.set(api, { api, type, company: entry.company });
  }
  const queue = [...boards.values()].slice(0, Number(config.aggregator_board_detail_cap ?? 80));
  let index = 0;
  async function worker() {
    while (index < queue.length) {
      const board = queue[index++];
      try {
        const json = await fetchJson(board.api);
        if (board.type === 'greenhouse') {
          for (const job of json.jobs || []) byKey.set(canonicalJobKey(job.absolute_url, board.company), {
            desc: stripHtml(job.content || ''), comp: null,
            posted: job.first_published || null, postedPrecision: job.first_published ? 'timestamp' : 'unknown',
          });
        } else if (board.type === 'ashby') {
          for (const job of json.jobs || []) byKey.set(canonicalJobKey(job.jobUrl, board.company), {
            desc: stripHtml(job.descriptionHtml || job.description || ''),
            comp: job.compensation?.compensationTierSummary || null,
            posted: job.publishedAt || null, postedPrecision: 'timestamp',
          });
        } else if (board.type === 'lever') {
          for (const job of json || []) byKey.set(canonicalJobKey(job.hostedUrl, board.company), {
            desc: stripHtml(job.descriptionPlain || ''), comp: null,
            posted: job.createdAt || null, postedPrecision: 'timestamp',
          });
        }
      } catch { /* report remains review-only when the source board is unavailable */ }
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
}

function loadLinkedinEntries() {
  try {
    const cache = JSON.parse(readFileSync(LINKEDIN_JDS, 'utf-8'));
    return Object.entries(cache).map(([url, j]) => ({
      url,
      company: j.company || 'Unknown',
      title: j.title || '',
      location: j.location || '',
      desc: j.desc || '',
      comp: null,
      postedRaw: j.posted_at || j.posted || null,
      postedPrecision: j.posted_precision || (/T/.test(String(j.posted || '')) ? 'time' : 'date'),
      discoveredAt: j.discovered_at || null,
      lastSeenAt: j.last_seen_at || null,
    }));
  } catch { return []; }
}

function loadIndeedEntries() {
  try {
    const cache = JSON.parse(readFileSync(INDEED_JDS, 'utf-8'));
    return Object.entries(cache).map(([url, j]) => ({ url, company: j.company || 'Unknown', title: j.title || '', location: j.location || '', desc: j.desc || '', comp: j.salary || null, postedRaw: j.posted || null }));
  } catch { return []; }
}

// ── Heuristic scoring ───────────────────────────────────────────────

const NEG_SPONSOR = ['unable to sponsor', 'cannot sponsor', 'will not sponsor', 'not able to sponsor', 'no visa sponsorship', 'without sponsorship', 'sponsorship is not available', 'not provide sponsorship', 'not offer sponsorship', 'us citizenship required', 'u.s. citizenship required', 'must be a us citizen', 'must be a u.s. citizen', 'citizenship is required', 'not eligible for visa sponsorship'];
function hasPositiveSponsorSignal(desc) {
  const text = String(desc || '').toLowerCase();
  return /\b(?:h-?1b|f-?1|cpt|opt)\b/.test(text)
    || /(?:visa )?sponsorship (?:is )?(?:available|provided|offered)/.test(text)
    || /(?:we|company) (?:can |do |will )?sponsor (?:visas?|candidates?|employees?)/.test(text);
}

function requiredExperienceYears(text) {
  const desc = String(text || '').replace(/\s+/g, ' ');
  const values = [];
  const patterns = [
    /(?:minimum(?: of)?|at least|required|requires?|must have|possess(?:es)?)?\s*(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?))?\s*\+?\s*(?:years?|yrs?)\s+(?:of\s+)?(?:[a-z][a-z+/#.-]*\s+){0,5}experience\b/gi,
    /(?:experience|experienced)\s+(?:of\s+|with\s+)?(?:at least\s+|minimum\s+of\s+)?(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?))?\s*\+?\s*(?:years?|yrs?)\b/gi,
    /(\d{1,2}(?:\.\d)?)(?:\s*(?:-|–|—|to)\s*(\d{1,2}(?:\.\d)?))?\s*\+?\s*(?:years?|yrs?)\s+(?:building|developing|designing|working (?:with|on)|programming|coding)\b/gi,
  ];
  for (const pattern of patterns) {
    for (const m of desc.matchAll(pattern)) {
      const start = Math.max(0, m.index - 45);
      const context = desc.slice(start, (m.index || 0) + m[0].length + 45).toLowerCase();
      if (/years? of age|company.{0,20}(?:founded|history)|sabbatical|anniversary|journey for|many with|subject matter experts|team members?|employees?|founders?|nobody has|no one has|does not require|not required/.test(context)) continue;
      const n = Number(m[1]);
      // For a range, the lower bound is the actual minimum requirement.
      if (n >= 0 && n <= 20) values.push(n);
    }
  }
  return values.length ? Math.max(...values) : 0;
}

function hasNoSponsorSignal(desc) {
  const text = String(desc || '').toLowerCase();
  return NEG_SPONSOR.some((p) => text.includes(p))
    || /(?:unable|cannot|can't|will not|won't|not able|do not|does not).{0,45}(?:sponsor|visa sponsorship)/s.test(text)
    || /(?:without (?:the )?need for|without requiring).{0,30}(?:visa )?sponsorship/s.test(text)
    || /(?:obtain|maintain|eligible for).{0,35}(?:security )?clearance/s.test(text)
    || /(?:active|current)\s+(?:[a-z-]+\s+)?(?:security )?clearance\s+(?:is\s+)?required/s.test(text)
    || /(?:requires?|must have).{0,45}(?:security )?clearance/s.test(text)
    || /(?:must|shall|required to)\s+(?:be|qualify as)\s+(?:a\s+)?u\.?s\.? person/.test(text)
    || /(?:itar|export control).{0,100}(?:u\.?s\.? (?:person|citizen)|citizenship)/s.test(text);
}

function normCompanyMention(company, desc) {
  const stop = new Set(['inc', 'llc', 'ltd', 'corp', 'corporation', 'company', 'group', 'solutions', 'technology', 'technologies', 'consulting', 'software', 'systems', 'services', 'global']);
  const tokens = String(company || '').toLowerCase().match(/[a-z0-9]+/g)?.filter((token) => token.length >= 4 && !stop.has(token)) || [];
  return tokens.some((token) => String(desc || '').includes(token));
}

function analyzeDecision(e) {
  const title = String(e.title || '').toLowerCase();
  const desc = String(e.desc || '').toLowerCase();
  const reposter = isReposterEntry(e);
  const staffing = isStaffingEntry(e);
  const thirdParty = /\b(?:on behalf of (?:our|a) client|our client (?:is|has been) (?:seeking|hiring)|recruiting (?:for|on behalf of)|talent solutions|recruitment agency)\b/.test(desc);
  const noSponsor = e.noSponsor || companySponsors(e.company) === 'no';
  const seniorTitle = /\b(?:senior|sr\.?|staff|principal|lead|manager|director|architect)\b/.test(title)
    || /\b(?:software|systems?|full.?stack|backend|frontend|platform|ai|ml|cloud|data)?\s*(?:engineer|developer)\s+(?:iii|iv|3|4)\b/.test(title);
  const midTitle = /\b(?:software|systems?|full.?stack|backend|frontend|platform|ai|ml|cloud|data)?\s*(?:engineer|developer)\s+(?:ii|2)\b/.test(title);
  const softwareTitle = /\b(?:software|backend|back.?end|full.?stack|frontend|front.?end|platform|infrastructure|cloud|ai|ml|machine learning|developer|programmer|swe|sde|member of technical staff|forward deployed engineer)\b/.test(title);
  const roleMismatch = !softwareTitle || /\b(?:customer success|technical support|support engineer|quality assurance|qa engineer|sdet|test engineer|low-code|no-code|paralegal|product management)\b/.test(title);
  const vagueExperience = e.requiredYears === 0 && /\b(?:we(?:'re| are)|company is) seeking (?:an? )?(?:highly )?(?:experienced|seasoned)\b/.test(desc.slice(0, 900));
  const genericJd = desc.length > 0 && desc.length < 1800 && !normCompanyMention(e.company, desc);
  const isIntern = /\bintern(?:ship)?\b/.test(title) && !/internal/.test(title);
  const futureCohort = /\b2027\b/.test(`${title} ${e.url || ''} ${desc.slice(0, 2500)}`);
  const enrolledRequirement = /(?:currently (?:enrolled|pursuing)|return(?:ing)? to (?:school|university)|graduat(?:e|ing|ion).{0,45}(?:2027|2028))/.test(desc);
  const divergence = e.ai == null ? 0 : Math.abs(e.ai - e.score);
  // ATS boards keep pipeline reqs open for years (Palantir new-grad reqs in
  // this archive are 424–1879 days old). They are real postings, but they are
  // not today's opportunity and they permanently squatted the apply list.
  const evergreen = Number.isFinite(e.daysAgo) && e.daysAgo > EVERGREEN_DAYS;
  const reasons = [];
  let decision = 'apply';

  if (reposter) { decision = 'quarantine'; reasons.push('reposter/aggregator source'); }
  else if (noSponsor) { decision = 'skip'; reasons.push('F-1/OPT sponsorship, citizenship, or clearance conflict'); }
  else if (!softwareTitle) { decision = 'skip'; reasons.push('non-software role admitted by broad discovery filter'); }
  else if (seniorTitle || e.requiredYears >= 5) { decision = 'skip'; reasons.push(seniorTitle ? 'senior-level title' : `${e.requiredYears}+ years required`); }
  else if ((isIntern && (futureCohort || enrolledRequirement)) || (!isIntern && futureCohort)) { decision = 'skip'; reasons.push('graduation/enrollment window likely incompatible'); }
  else {
    if (staffing || thirdParty) reasons.push('staffing/recruiter source—verify employer and STEM OPT arrangement');
    if (isIntern) reasons.push('internship—verify post-graduation/OPT eligibility');
    if (e.requiredYears >= 2) reasons.push(`${e.requiredYears}+ years requested`);
    if (midTitle) reasons.push('level-II title—verify entry-level eligibility');
    if (roleMismatch) reasons.push('adjacent/non-core SWE role');
    if (vagueExperience) reasons.push('JD asks for an experienced hire without a numeric level');
    if (genericJd) reasons.push('short/generic JD—verify employer and posting specificity');
    if (!e.desc) reasons.push('no JD text—fit and visa terms unverified');
    // Divergence is reported as signal, never as a demotion. AI and heuristic
    // measure different things, so they disagree by 30+ on roughly a third of
    // scored rows — gating on it emptied "Apply first" every single run.
    if (divergence >= 30) reasons.push(`AI/heuristic divergence (${e.ai} vs ${e.score})`);
    if (evergreen) reasons.push(`posting is ${e.daysAgo}d old—likely an evergreen/pipeline req`);
    const aiLevelConcern = /\b(?:mid[- ]level|senior[- ]level|senior role)\b/i.test(e.aiReason || '') || e.aiEligibility === 'ineligible' || e.aiLevel === 'senior';
    if (aiLevelConcern) reasons.push('AI fit note indicates a level/eligibility concern');
    if (staffing || thirdParty || isIntern || e.requiredYears >= 2 || midTitle || roleMismatch || vagueExperience || genericJd || !e.desc || evergreen || aiLevelConcern) decision = 'review';
    else if (e.ai == null) {
      if (e.score < 65) { decision = 'review'; reasons.push('AI fit not scored yet'); }
    } else if (e.ai < 70) {
      decision = 'review';
      reasons.push('fit score below apply-first threshold');
    } else if (e.score < HEURISTIC_FLOOR) {
      // The AI reads the JD in isolation, so a well-written posting at a
      // no-name shop can score 98 while the heuristic — which knows company
      // tier, location, sponsorship and skill overlap — sits in the 30s.
      // Apply-first requires both signals; the AI alone is not enough.
      decision = 'review';
      reasons.push(`AI-only signal (heuristic ${e.score} below the ${HEURISTIC_FLOOR} apply floor)`);
    }
  }

  e.decision = decision;
  e.decisionReasons = reasons;
  e.sourceQuality = reposter ? 'reposter' : (staffing || thirdParty) ? 'staffing' : (e._sourceQuality || 'direct/unknown');
  e.sponsorshipRisk = noSponsor ? 'high' : (e.positiveSponsor || companySponsors(e.company) === 'yes') ? 'positive' : 'unknown';
  e.timelineRisk = futureCohort || enrolledRequirement ? 'high' : isIntern ? 'review' : 'none';
  e.levelFit = seniorTitle || e.requiredYears >= 5 ? 'too-senior' : midTitle || e.requiredYears >= 2 ? 'stretch' : 'entry-compatible';
  return e;
}

function scoreEntry(e) {
  const title = e.title.toLowerCase();
  const loc = (e.location || '').toLowerCase();
  const desc = (e.desc || '').toLowerCase();
  let score = 30;
  const flags = [];

  const tier = tierByCompany.get(e.company.toLowerCase());
  if (tier === 1) score += 14; else if (tier === 2) score += 9; else if (tier === 3) score += 5;

  // Per-company H-1B sponsorship signal (from config.sponsors) — applies even
  // when the JD says nothing about sponsorship.
  const coSponsor = companySponsors(e.company);
  if (coSponsor === 'yes') flags.push('🛂');
  else if (coSponsor === 'no') { score -= 30; flags.push('🚫 no-sponsor-co'); }

  if (isReposterEntry(e)) { score -= 40; flags.push('🚯 reposter'); }
  else if (isStaffingEntry(e)) { score -= 18; flags.push('🏢 staffing'); }

  if (/new grad|university grad|early career|entry.level|recent grad|engineer i\b|swe i\b|engineer 1\b/.test(title)) { score += 20; flags.push('🎓 new-grad'); }
  if (/intern/.test(title) && !/internal/.test(title)) { score += 16; flags.push('🎓 intern'); }
  if (/backend|back-end|server/.test(title)) score += 10;
  else if (/full.stack/.test(title)) score += 10;
  else if (/\bai\b|machine learning|\bml\b|llm/.test(title)) score += 7;
  else if (/platform|infra|devtools|developer (experience|productivity)/.test(title)) score += 5;
  else if (/frontend|front-end/.test(title)) score -= 4;
  if (/sdet|test|quality/.test(title)) score -= 8;
  if (!/engineer|developer|swe|sde|intern|scientist/.test(title)) score -= 20;

  if (/new york|new jersey|\bnyc\b|\bny\b|\bnj\b|hoboken|jersey city|brooklyn,? (?:ny|new york)/.test(loc)) { score += 12; flags.push('🗽 NY'); }
  else if (/remote/.test(loc)) score += 8;
  else if (/san francisco|seattle|boston|bay area/.test(loc)) score += 6;
  else if (loc) score += 2;

  if (desc) {
    let exp = 0, str = 0;
    for (const s of expertSkills) if (desc.includes(s)) exp += 2;
    for (const s of strongSkills) if (desc.includes(s)) str += 1;
    score += Math.min(exp, 12) + Math.min(str, 6);

    e.requiredYears = requiredExperienceYears(desc);
    if (e.requiredYears >= 5) { score -= 25; flags.push(`⏳ ${e.requiredYears}y ask`); }
    else if (e.requiredYears >= 3) { score -= 12; flags.push(`⏳ ${e.requiredYears}y ask`); }
    if (/new grad|recent graduate|graduating in|no prior experience/.test(desc)) score += 6;

    e.noSponsor = Boolean(e.sourceNoSponsor || hasNoSponsorSignal(desc));
    e.positiveSponsor = !e.noSponsor && hasPositiveSponsorSignal(desc);
    if (e.noSponsor) { score -= 35; flags.push('⚠️ no-sponsor'); }
    else if (e.positiveSponsor) { score += 5; flags.push('✅ sponsors'); }

    const sal = desc.match(/\$\s?(\d{2,3})[,.]?\d{3}/g);
    if (sal) {
      const nums = sal.map((s) => parseInt(s.replace(/[^\d]/g, ''), 10)).filter((n) => n >= 60000 && n <= 900000);
      if (nums.length) {
        const max = Math.max(...nums);
        e.salary = `$${Math.round(Math.min(...nums) / 1000)}k–$${Math.round(max / 1000)}k`;
        if (max >= 130000) score += 4; else if (max >= 110000) score += 2;
      }
    }
  } else {
    e.requiredYears = 0;
    e.noSponsor = Boolean(e.sourceNoSponsor);
    e.positiveSponsor = false;
    if (e.noSponsor) { score -= 35; flags.push('⚠️ no-sponsor'); }
    flags.push('· no JD text');
  }
  if (e.comp && !e.salary) e.salary = e.comp;

  if (e.daysAgo !== null && e.daysAgo !== undefined) {
    // A negative daysAgo means the source date is in the future (bad upstream
    // data, e.g. a year-less date parsed against the wrong year) — never a
    // legitimate 🆕 signal.
    if (e.daysAgo >= 0 && e.daysAgo <= 7) { score += 4; flags.push('🆕'); }
    else if (e.daysAgo > 7 && e.daysAgo <= 14) score += 2;
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
const contentHash = (value) => createHash('sha256').update(String(value || '')).digest('hex').slice(0, 16);

function parseJsonArray(output) {
  const text = String(output || '').replace(/```(?:json)?/gi, '').replace(/```/g, '');
  const starts = [...text.matchAll(/\[/g)].map((match) => match.index);
  for (const start of starts) {
    for (let end = text.lastIndexOf(']'); end > start; end = text.lastIndexOf(']', end - 1)) {
      try {
        const value = JSON.parse(text.slice(start, end + 1));
        if (Array.isArray(value)) return value;
      } catch { /* try the next possible array boundary */ }
    }
  }
  return null;
}

const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function geminiScoreBatch(batch, resume) {
  const cli = config.ai_cli || 'gemini';
  // Antigravity (agy) is agentic — without this guard it explores the filesystem
  // before answering. The guard makes it a clean ~3s completion. No-op for gemini.
  const guard = cli === 'agy'
    ? `IMPORTANT: Do NOT use any tools. Do NOT read any files. Use ONLY the text in this prompt.\n\n`
    : '';
  const prompt = guard + [
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
    `[{"i":0,"score":NN,"reason":"<max 12 words>","level":"entry|stretch|senior","sponsorship":"positive|unknown|blocked","eligibility":"eligible|review|ineligible"}, ...]`,
  ].join('\n');
  // Model flag differs per CLI: agy uses --model, gemini uses -m.
  const modelFlag = cli === 'agy' ? '--model' : '-m';
  const args = config.ai_model ? [modelFlag, config.ai_model, '-p', prompt] : ['-p', prompt];
  const attempts = Math.max(1, Number(config.ai_retries ?? 3));
  const retryDelay = Math.max(0, Number(config.ai_retry_delay_ms ?? 4000));
  let lastError = `${cli} gave no JSON`;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const r = spawnSync(cli, args, { encoding: 'utf-8', timeout: 240000 });
    const rows = parseJsonArray(r.stdout) || parseJsonArray(r.stderr);
    const returned = new Set((rows || []).filter((row) => Number.isInteger(row?.i) && Number.isFinite(Number(row?.score))).map((row) => row.i));
    const complete = batch.every((_, index) => returned.has(index));
    if (rows && complete) return rows;

    const detail = r.error?.message || String(r.stderr || r.stdout || '').trim().split('\n').at(-1) || 'no output';
    lastError = rows
      ? `${cli} returned ${returned.size}/${batch.length} valid rows (exit ${r.status})`
      : `${cli} gave no JSON (exit ${r.status}: ${detail.slice(0, 140)})`;
    if (attempt < attempts) {
      process.stdout.write(`retry ${attempt}/${attempts - 1}… `);
      sleepSync(retryDelay * attempt);
    }
  }
  throw new Error(lastError);
}

function aiScore(entries, threshold) {
  const cache = loadAiCache();
  const resume = readFileSync('cv.md', 'utf-8').slice(0, 6000);
  const resumeHash = contentHash(resume);
  let todo = [];
  if (USE_AI || REFRESH_AI) {
    // The same JD text is reposted under many URLs (LinkedIn especially), and
    // the cache is keyed by URL — so identical text was being sent to Gemini
    // once per copy. Reuse a score already paid for when the JD text, résumé
    // and prompt all match; only the source-quality penalties differ, and
    // those are applied outside the model.
    const byJdHash = new Map();
    for (const [url, entry] of Object.entries(cache))
      if (entry?.jd_hash && entry.prompt_version === AI_PROMPT_VERSION && entry.resume_hash === resumeHash && !entry.reused_from_url)
        byJdHash.set(entry.jd_hash, { url, entry });
    let reused = 0;
    todo = entries.filter((e) => {
      if (!e.desc || e.score < threshold) return false;
      const cached = cache[e.url];
      if (!cached) {
        const twin = byJdHash.get(contentHash(e.desc));
        if (!twin) return true;
        cache[e.url] = { ...twin.entry, reused_from_url: twin.url };
        reused++;
        return false;
      }
      if (!REFRESH_AI) return false;
      return cached.prompt_version !== AI_PROMPT_VERSION || cached.resume_hash !== resumeHash || cached.jd_hash !== contentHash(e.desc);
    });
    // Newest first, so whatever the cap trims is always the stalest work.
    todo.sort((a, b) => (a.daysAgo ?? 9999) - (b.daysAgo ?? 9999));
    const cap = REFRESH_AI
      ? Number(config.linkedin?.ai_refresh_cap ?? 100)
      : Number(config.ai_new_cap ?? 200);
    if (todo.length > cap) {
      console.log(`\n   (capping AI scoring at ${cap} newest of ${todo.length} — raise ai_new_cap in config.yml to widen)`);
      todo = todo.slice(0, cap);
    }
    if (reused) {
      writeAtomic(AI_CACHE_PATH, JSON.stringify(cache, null, 1) + '\n');
      console.log(`\n♻️  Reused ${reused} cached score${reused === 1 ? '' : 's'} for reposts with identical JD text (no AI call).`);
    }
    console.log(`\n🤖  Gemini AI scoring: ${todo.length} ${REFRESH_AI ? 'new/stale' : 'new'} openings with JD text${threshold > 0 ? ` ≥${threshold}` : ''} (cached: ${Object.keys(cache).length})`);
  }
  if (todo.length) {
    const cli = config.ai_cli || 'gemini';
    const BATCH = 5;
    let ok = 0, failedStart = 0;
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      process.stdout.write(`   batch ${i / BATCH + 1}/${Math.ceil(todo.length / BATCH)}… `);
      try {
        for (const row of geminiScoreBatch(batch, resume)) {
          const e = batch[row.i];
          if (e && Number.isFinite(row.score)) cache[e.url] = {
            score: Math.max(0, Math.min(100, Math.round(row.score))),
            reason: String(row.reason || '').slice(0, 80),
            level: String(row.level || 'unknown').slice(0, 20),
            sponsorship: String(row.sponsorship || 'unknown').slice(0, 20),
            eligibility: String(row.eligibility || 'review').slice(0, 20),
            date: new Date().toISOString().slice(0, 10),
            scored_at: new Date().toISOString(),
            model: config.ai_model || 'cli-default',
            prompt_version: AI_PROMPT_VERSION,
            resume_hash: resumeHash,
            jd_hash: contentHash(e.desc),
          };
        }
        console.log('ok'); ok++;
      } catch (err) {
        console.log(`failed (${err.message.split('\n')[0]})`);
        // Likely an auth/setup problem (not transient) if the first calls all fail.
        if (ok === 0 && ++failedStart >= 2) {
          console.log(`\n⚠️  AI scoring isn't working — is the '${cli}' CLI signed in?`);
          console.log(`   Run \`${cli}\` once in a terminal to log in, then re-run. (Heuristic scores still applied.)`);
          break;
        }
      }
      writeAtomic(AI_CACHE_PATH, JSON.stringify(cache, null, 1) + '\n');
    }
    if (ok === 0 && failedStart < 2 && todo.length) {
      console.log(`\n⚠️  No AI scores produced — check that '${cli}' is installed and signed in. Heuristic scores still applied.`);
    }
  }
  attachCachedAi(entries, cache);
}

function attachCachedAi(entries, suppliedCache = null) {
  const cache = suppliedCache || loadAiCache();
  // A cached score is only meaningful while a JD is available. Showing a
  // title-only capped score looked authoritative even though visa/level terms
  // could not be checked.
  for (const e of entries) {
    const c = cache[e.url];
    if (e.desc && c && Number.isFinite(Number(c.score))) {
      e.ai = Number(c.score);
      e.aiReason = c.reason;
      e.aiLevel = c.level || null;
      e.aiSponsorship = c.sponsorship || null;
      e.aiEligibility = c.eligibility || null;
    }
  }
}

// ── Render ──────────────────────────────────────────────────────────

const now = Date.now();
// LinkedIn entries use postedPrecision 'time' for an exact minute/hour-ago
// timestamp (see loadLinkedinEntries); ATS/aggregator entries use 'timestamp'.
// Both are exact — only 'date'/'relative-day'/'unknown' are approximate.
const isExactPrecision = (precision) => precision === 'timestamp' || precision === 'time';
const fmtPosted = (e) => {
  if (e.postedDate) return `${e.postedDate.toISOString().slice(0, 10)} (${e.daysAgo}d${isExactPrecision(e.postedPrecision) ? '' : ' ≈'})`;
  if (e.discoveredDate) return `found ${e.discoveredDate.toISOString().slice(0, 10)} (posted unknown)`;
  return '—';
};

function inFreshnessWindow(e, days) {
  if (days == null || days === 0) return true;
  const date = e.postedDate || e.discoveredDate;
  if (!date) return false;
  if (e.postedDate && isExactPrecision(e.postedPrecision)) {
    const age = now - date.getTime();
    return age >= -3600000 && age <= days * 86400000;
  }
  const today = Date.parse(`${new Date(now).toISOString().slice(0, 10)}T00:00:00Z`);
  const dateDay = Date.parse(`${date.toISOString().slice(0, 10)}T00:00:00Z`);
  const calendarDays = Math.floor((today - dateDay) / 86400000);
  return calendarDays >= 0 && calendarDays <= days;
}

function applyDaysFilter(list, label) {
  if (MAX_DAYS === null) return list;
  const kept = list.filter((e) => inFreshnessWindow(e, MAX_DAYS));
  console.log(`--days ${MAX_DAYS}: ${kept.length} of ${list.length} ${label} openings in the scoring window (posting time when known; discovery time otherwise)`);
  return kept;
}

function sortRanked(list) {
  // Reposters/staffing sources don't get the AI-first boost: the copied JD can
  // be a great fit while the source itself still needs quarantine/review.
  const key = (e) => (isSuppressedSource(e) ? e.score : (e.ai ?? e.score));
  list.sort((a, b) => key(b) - key(a) || b.score - a.score || (a.daysAgo ?? 999) - (b.daysAgo ?? 999));
  return list;
}

const mdCell = (value) => String(value ?? '—').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim() || '—';
const mdLinkText = (value) => mdCell(value).replace(/([\[\]])/g, '\\$1');
const decisionSignal = (e) => ({ apply: '🟢 apply', review: '🟡 review', skip: '🔴 skip', quarantine: '🚯 quarantine' }[e.decision] || '🟡 review');

function renderLeaderboard(ranked, outPath, title, aiNote, { fullArchive = false, strictApply = false } = {}) {
  const date = new Date().toISOString().slice(0, 10);
  const top = ranked.filter((e) => strictApply ? e.decision === 'apply' : !['skip', 'quarantine'].includes(e.decision)).slice(0, TOP_N);
  const topUrls = new Set(top.map((e) => e.url));
  const topHeading = strictApply ? 'Apply-first list' : 'Top candidates (apply + review)';
  const lines = [
    `# ${title}`, ``,
    `> Generated ${date} · ${ranked.length} openings scored${!fullArchive && MAX_DAYS !== null ? ` (last ${MAX_DAYS} days)` : ''}${fullArchive ? ' · complete retained archive (not a freshness view)' : ''}`,
    `> Score /100: heuristic — company tier + title fit + location (NY first) + skill overlap + experience ask + sponsorship + salary + freshness.`,
    `> AI /100: Gemini reads the full JD vs your resume. ${aiNote} 💬 = Gemini's one-line reason.`,
    `> AI leads the fit decision; the heuristic remains the deterministic cross-check. A hard eligibility gate overrides either score.`,
    `> ⚠️ no-sponsor = visa/citizenship/clearance conflict — skip. 🆕 = posted ≤7 days · 📅 evergreen = 6+ months old.`,
    ``, `## ${topHeading} (top ${top.length})`, ``,
    `| # | AI | Score | Company | Role | Location | Posted | Salary | Signals |`,
    `|---|----|-------|---------|------|----------|--------|--------|---------|`,
  ];
  top.forEach((e, i) => {
    const signals = [decisionSignal(e), e.flags.join(' '), e.decisionReasons?.length ? `· ${e.decisionReasons.join('; ')}` : '', e.aiReason ? `💬 ${e.aiReason}` : ''].filter(Boolean).join(' ') || '—';
    lines.push(`| ${i + 1} | ${e.ai != null ? `**${e.ai}**` : '—'} | ${e.score} | ${mdCell(e.company)} | [${mdLinkText(e.title)}](${e.url}) | ${mdCell(e.location)} | ${fmtPosted(e)} | ${mdCell(e.salary)} | ${mdCell(signals)} |`);
  });
  lines.push(``, `## Full ranking`, ``, `| AI | Score | Company | Role | Location | Posted | Salary | Signals |`, `|----|-------|---------|------|----------|--------|--------|---------|`);
  for (const e of ranked.filter((row) => !topUrls.has(row.url))) {
    const signals = [decisionSignal(e), e.flags.join(' '), e.decisionReasons?.length ? `· ${e.decisionReasons.join('; ')}` : '', e.aiReason ? `💬 ${e.aiReason}` : ''].filter(Boolean).join(' ') || '—';
    lines.push(`| ${e.ai ?? '—'} | ${e.score} | ${mdCell(e.company)} | [${mdLinkText(e.title)}](${e.url}) | ${mdCell(e.location)} | ${fmtPosted(e)} | ${mdCell(e.salary)} | ${mdCell(signals)} |`);
  }
  lines.push(``);
  writeAtomic(outPath, lines.join('\n'));
  console.log(`\n${title} — top ${Math.min(10, top.length)}:`);
  for (const e of top.slice(0, 10))
    console.log(`  ${e.ai != null ? `AI:${String(e.ai).padStart(3)}` : '      '} h:${String(e.score).padStart(3)}  ${e.company} — ${e.title}  [${e.location || '?'}] ${fmtPosted(e)} ${e.flags.join(' ')}`);
  console.log(`→ ${outPath}`);
}

function writeLinkedinRanked(ranked) {
  const rows = ranked.map((e) => ({
    url: e.url,
    company: e.company,
    title: e.title,
    location: e.location || '',
    ai: e.ai ?? null,
    aiReason: e.aiReason || '',
    heuristic: e.score,
    flags: e.flags,
    salary: e.salary || null,
    postedAt: e.postedDate?.toISOString() || null,
    postedPrecision: e.postedPrecision || 'unknown',
    discoveredAt: e.discoveredAt || null,
    lastSeenAt: e.lastSeenAt || null,
    daysAgo: e.daysAgo,
    decision: e.decision,
    decisionReasons: e.decisionReasons,
    sourceQuality: e.sourceQuality,
    sponsorshipRisk: e.sponsorshipRisk,
    timelineRisk: e.timelineRisk,
    requiredYears: e.requiredYears || 0,
    levelFit: e.levelFit,
    descriptionFingerprint: e.desc ? contentHash(e.desc.toLowerCase().replace(/\s+/g, ' ')) : null,
  }));
  writeAtomic(LINKEDIN_RANKED_OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 1) + '\n');
  console.log(`→ ${LINKEDIN_RANKED_OUT} (structured source for the 24-hour view)`);
}

function writeBoardRanked(ranked, outPath, lane) {
  const rows = ranked.map((e) => ({
    canonicalKey: e._key,
    url: e.url,
    company: e.company,
    title: e.title,
    location: e.location || '',
    lane,
    source: e._portal || '',
    sourceQuality: e.sourceQuality || e._sourceQuality || 'unknown',
    ai: e.ai ?? null,
    aiReason: e.aiReason || '',
    heuristic: e.score,
    flags: e.flags,
    salary: e.salary || null,
    postedAt: e.postedDate?.toISOString() || null,
    postedPrecision: e.postedPrecision || 'unknown',
    postedRaw: e.postedRaw || '',
    discoveredAt: e.discoveredDate?.toISOString() || null,
    discoveredPrecision: e.discoveredPrecision || 'unknown',
    lastSeenAt: e.lastSeenAt || null,
    daysAgo: e.daysAgo,
    freshnessBasis: e.postedDate ? 'source posting time' : e.discoveredDate ? 'discovery time' : 'unknown',
    decision: e.decision,
    decisionReasons: e.decisionReasons,
    sponsorshipRisk: e.sponsorshipRisk,
    timelineRisk: e.timelineRisk,
    requiredYears: e.requiredYears || 0,
    levelFit: e.levelFit,
    hasDescription: Boolean(e.desc),
    descriptionFingerprint: e.desc ? contentHash(e.desc.toLowerCase().replace(/\s+/g, ' ')) : null,
  }));
  writeAtomic(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), lane, count: rows.length, rows }, null, 1) + '\n');
  console.log(`→ ${outPath} (structured ${lane} archive)`);
}

// ── Main ────────────────────────────────────────────────────────────

const history = parseHistory();
const boardStore = loadBoardStore();
const board = parsePipeline(history, boardStore);
if (board.length) {
  const orphans = Number(board.orphanCount || 0);
  const hiddenExact = Math.max(0, Number(board.rawCount || board.length) - board.length - orphans);
  console.log(`Ranking ${board.length} canonical board openings${hiddenExact ? ` (${hiddenExact} duplicate pipeline rows suppressed)` : ''}${orphans ? `, ${orphans} pre-store rows without JD/date skipped` : ''}…`);
  const descriptions = await fetchDescriptions();
  await addWorkdayDescriptions(board, descriptions);
  await addAggregatorBoardDescriptions(board, descriptions);
  for (const e of board) {
    const h = e._history || {};
    const record = e._record || {};
    e.location = record.location || h.location || '';
    e._portal = record.source || e._portal || h.portal || '';
    const d = descriptions.get(e._key);
    e.desc = (d?.desc || '').length >= (record.description || '').length ? (d?.desc || '') : (record.description || '');
    e.comp = d?.comp || record.compensation || null;
    e.postedDate = parsePosted(d?.posted) || parsePosted(record.source_posted_at);
    e.postedPrecision = d?.posted ? (d.postedPrecision || 'timestamp') : (record.posted_precision || 'unknown');
    e.postedRaw = record.posted_raw || '';
    e.discoveredDate = parsePosted(record.discovered_at) || parsePosted(h.first_seen);
    e.discoveredPrecision = record.discovered_at ? 'timestamp' : h.first_seen ? 'date' : 'unknown';
    e.lastSeenAt = record.last_seen_at || null;
    e.sourceNoSponsor = Boolean(record.no_sponsor || record.citizenship_required);
    const freshnessDate = e.postedDate || e.discoveredDate;
    e.daysAgo = freshnessDate ? Math.floor((now - freshnessDate.getTime()) / 86400000) : null;
    scoreEntry(e);
  }
  const atsEntries = board.filter((e) => e._lane === 'ats');
  const aggEntries = board.filter((e) => e._lane !== 'ats');
  const aiNote = `Computed for every job with JD text; cached scores remain visible on every run.`;

  if (atsEntries.length) {
    const scoringScope = applyDaysFilter(atsEntries, 'ATS');
    aiScore(scoringScope, AI_THRESHOLD);
    attachCachedAi(atsEntries);
    atsEntries.forEach(analyzeDecision);
    sortRanked(atsEntries);
    writeBoardRanked(atsEntries, ATS_RANKED_OUT, 'ats');
    renderLeaderboard(atsEntries, ATS_OUT, 'ATS Archive — all discovered jobs', aiNote, { fullArchive: true });
  }
  if (aggEntries.length) {
    const scoringScope = applyDaysFilter(aggEntries, 'aggregator');
    aiScore(scoringScope, AI_THRESHOLD);
    attachCachedAi(aggEntries);
    aggEntries.forEach(analyzeDecision);
    sortRanked(aggEntries);
    writeBoardRanked(aggEntries, AGG_RANKED_OUT, 'aggregator');
    renderLeaderboard(aggEntries, AGG_OUT, 'Aggregator Archive — all discovered jobs', aiNote, { fullArchive: true });
  }
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
  aiScore(ranked, 0);
  ranked.forEach(analyzeDecision);
  sortRanked(ranked);
  writeLinkedinRanked(ranked);
  renderLeaderboard(ranked, LINKEDIN_OUT, 'LinkedIn Archive — all discovered jobs', 'Computed for jobs with JD text; cached scores remain visible on every run.', { fullArchive: true, strictApply: true });
}

const ind = loadIndeedEntries();
if (ind.length) {
  console.log(`\nRanking ${ind.length} Indeed openings…`);
  for (const e of ind) {
    e.postedDate = parsePosted(e.postedRaw);
    e.daysAgo = e.postedDate ? Math.floor((now - e.postedDate.getTime()) / 86400000) : null;
    scoreEntry(e);
  }
  // Same convention as LinkedIn: full list, no --days filter, no title filter.
  const ranked = ind;
  aiScore(ranked, 0);
  ranked.forEach(analyzeDecision);
  sortRanked(ranked);
  renderLeaderboard(ranked, INDEED_OUT, 'Top Openings — Indeed', 'Filtered by title_filter/location_filter/company_blocklist before import; Gemini also judges each JD for experience-level and sponsorship fit.', { fullArchive: true });
}

// The decision views read the *-ranked.json files this run just rewrote, so
// rebuild them here — otherwise a standalone `node rank.mjs` leaves the recent
// views showing the previous run's scores. LinkedIn stays a 24-hour view.
console.log('');
spawnSync('node', ['board-recent.mjs', '--days', String(MAX_DAYS ?? 1)], { stdio: ['ignore', 'inherit', 'inherit'] });
console.log('');
spawnSync('node', ['linkedin-recent.mjs', '--days', '1'], { stdio: ['ignore', 'inherit', 'inherit'] });
