import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

export const BOARD_STORE_PATH = 'data/board-jobs.json';
const PIPELINE_PATH = 'data/pipeline.md';
const HISTORY_PATH = 'data/scan-history.tsv';
const WRITE_LOCK_PATH = 'data/.board-write.lock';
const LOCK_STALE_MS = 30 * 60 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const cleanTsv = (value) => String(value || '').replace(/[\t\r\n]+/g, ' ').trim();
const normCompany = (value) => String(value || '').toLowerCase()
  .replace(/&amp;/g, ' and ')
  .replace(/\b(?:incorporated|inc|llc|ltd|corp|corporation|company|co)\b\.?/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function writeAtomic(path, content) {
  const temp = `${path}.tmp-${process.pid}`;
  writeFileSync(temp, content, 'utf-8');
  renameSync(temp, path);
}

export function toIsoTimestamp(value) {
  // 0 is aggregators.mjs's "unparseable date" sentinel, not a real epoch
  // timestamp — treating it as 1970-01-01 poisoned freshness/evergreen scoring.
  if (value == null || value === '' || value === 0) return null;
  let raw = value;
  if (typeof raw === 'number' && raw > 0 && raw < 1e12) raw *= 1000;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function relativePostedTimestamp(value, baseIso) {
  const text = String(value || '').toLowerCase().replace(/posted/g, '').trim();
  if (!text) return null;
  const base = Date.parse(baseIso);
  if (!Number.isFinite(base)) return null;
  if (/^(?:today|just now|new)$/.test(text)) return new Date(base).toISOString();
  if (text === 'yesterday') return new Date(base - 86400000).toISOString();
  const match = text.match(/(\d+)\+?\s*(minute|hour|day|week|month)s?\s*(?:ago)?/);
  if (!match) return null;
  const scale = { minute: 60000, hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 }[match[2]];
  return new Date(base - Number(match[1]) * scale).toISOString();
}

export function canonicalJobKey(rawUrl, company = '') {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, '');
    let match;

    if (host.endsWith('.myworkdayjobs.com')) {
      // Requisition ID suffix, e.g. "..._R29874" or "..._JR2024002". Some
      // tenants (Mastercard) put a hyphen between the letter prefix and the
      // digits ("_R-277842") — without the optional "-?" this never matched,
      // so those postings silently fell back to full-URL dedup and reappeared
      // as "new" whenever Workday's title-derived slug shifted.
      match = path.match(/_([a-z]{1,6}-?\d[\w-]*)$/i);
      if (match) return `workday:${host.split('.')[0]}:${match[1].toLowerCase()}`;
    }
    if (/greenhouse\.io$/.test(host) || url.searchParams.has('gh_jid')) {
      const id = url.searchParams.get('gh_jid') || path.match(/\/jobs\/(\d+)/i)?.[1];
      const board = /greenhouse\.io$/.test(host) ? path.match(/^\/([^/]+)\/jobs\//i)?.[1] : null;
      if (id) return `greenhouse:${String(board || normCompany(company) || host).toLowerCase()}:${id}`;
    }
    if (host === 'jobs.ashbyhq.com') {
      match = path.match(/\/([0-9a-f]{8}-[0-9a-f-]{27,})$/i);
      if (match) return `ashby:${match[1].toLowerCase()}`;
    }
    if (host === 'jobs.lever.co') {
      match = path.match(/\/([^/]+)\/([0-9a-f-]{16,})$/i);
      if (match) return `lever:${match[1].toLowerCase()}:${match[2].toLowerCase()}`;
    }
    if (/(?:^|\.)amazon\.jobs$/.test(host)) {
      match = path.match(/\/jobs\/(\d+)/i);
      if (match) return `amazon:${match[1]}`;
    }
    if (host === 'jobright.ai') {
      match = path.match(/\/jobs\/info\/([^/]+)/i);
      if (match) return `jobright:${match[1].toLowerCase()}`;
    }

    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gh_src|t|source|ref|referrer|tracking|campaign)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = '';
    url.hostname = host;
    url.pathname = url.pathname.replace(/\/en-US\//i, '/').replace(/\/+$/, '') || '/';
    const params = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
    url.search = '';
    for (const [key, value] of params) url.searchParams.append(key, value);
    return `url:${url.href}`;
  } catch {
    return `raw:${String(rawUrl || '').trim()}`;
  }
}

// ── Shared title/location filters ───────────────────────────────────
//
// Every lane (ATS, aggregators, Indeed, and LinkedIn's fetch ordering) filters
// on the same config lists, so they live here rather than being re-implemented
// per scanner and drifting apart.
//
// Negative terms match on word boundaries. Plain substring matching made some
// positives permanently unreachable: `Member of Technical Staff` was killed by
// the negative `Staff` — 134 live openings across the configured boards, at
// exactly the AI-lab companies where MTS is the standard IC title — and
// `GraphDB` tripped `PhD`, `Salesforce` tripped `Sales`, `Directory` tripped
// `Director`. Positives stay substring matches so a partial term ("Full Stack",
// "New Grad") still matches inside a longer title.
const escapeRegExp = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function termMatcher(term) {
  const text = String(term).trim();
  // Only anchor the ends that are word characters, so "Sr." and "Sr " keep
  // matching the way the config author wrote them.
  const prefix = /^\w/.test(text) ? '\\b' : '';
  const suffix = /\w$/.test(text) ? '\\b' : '';
  return new RegExp(`${prefix}${escapeRegExp(text)}${suffix}`, 'i');
}

// Positive/negative predicates on their own, for callers that weigh the two
// separately instead of asking for one boolean (linkedin.mjs orders its JD
// fetch queue by title fit rather than filtering on it).
export function buildTitleTerms(tf) {
  const positive = (tf?.positive || []).map((term) => String(term).toLowerCase());
  const negative = (tf?.negative || []).map((term) => ({ term: String(term).trim().toLowerCase(), re: termMatcher(term) }));

  // Every span in the title covered by a matched positive phrase.
  function positiveSpans(title) {
    const s = String(title || '').toLowerCase();
    const spans = [];
    for (const term of positive) {
      if (!term) continue;
      for (let i = s.indexOf(term); i !== -1; i = s.indexOf(term, i + 1)) spans.push([i, i + term.length]);
    }
    return spans;
  }

  return {
    hasPositive: (title) => positive.length === 0 || positiveSpans(title).length > 0,
    // A negative term sitting INSIDE a positive phrase is part of that phrase,
    // not a separate signal: `Member of Technical Staff` is not a staff-level
    // role, it is the whole title. Only negatives outside every matched
    // positive span reject the title, so `Staff Software Engineer` still goes.
    hasNegative: (title) => {
      const text = String(title || '');
      const spans = positiveSpans(text);
      for (const { re } of negative) {
        const global = new RegExp(re.source, 'gi');
        for (const match of text.matchAll(global)) {
          const start = match.index, end = start + match[0].length;
          if (!spans.some(([from, to]) => start >= from && end <= to)) return true;
        }
      }
      return false;
    },
  };
}

export function buildTitleFilter(tf) {
  const { hasPositive, hasNegative } = buildTitleTerms(tf);
  return (title) => hasPositive(title) && !hasNegative(title);
}

export function buildLocationFilter(lf) {
  if (!lf) return () => true;
  const norm = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v])).filter((x) => typeof x === 'string').map((x) => x.toLowerCase().trim()).filter(Boolean);
  const always = norm(lf.always_allow), allow = norm(lf.allow), block = norm(lf.block);
  return (loc) => {
    if (typeof loc !== 'string' || !loc.trim()) return true;
    const s = loc.toLowerCase();
    if (always.length && always.some((k) => s.includes(k))) return true;
    if (block.length && block.some((k) => s.includes(k))) return false;
    if (allow.length === 0) return true;
    return allow.some((k) => s.includes(k));
  };
}

export function sourceQualityFor({ company = '', source = '', url = '' } = {}, blocklist = [], staffing = []) {
  const companyText = String(company).toLowerCase();
  const sourceText = String(source).toLowerCase();
  let host = '';
  try { host = new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch { /* invalid URL */ }
  const reposter = blocklist.some((item) => companyText.includes(String(item).toLowerCase()))
    || /jobright|jobgether|lensa|remotehunter/.test(`${sourceText} ${host}`);
  if (reposter) return 'reposter';
  if (staffing.some((item) => companyText.includes(String(item).toLowerCase()))) return 'staffing';
  if (/-api$/.test(sourceText) || /greenhouse|ashby|lever|workday|amazonjobs/.test(sourceText)) return 'direct';
  return host ? 'direct/unknown' : 'unknown';
}

export function loadBoardStore(path = BOARD_STORE_PATH) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return { version: 1, updated_at: parsed.updated_at || null, jobs: parsed.jobs && typeof parsed.jobs === 'object' ? parsed.jobs : {} };
    }
  } catch { /* start with an empty store */ }
  return { version: 1, updated_at: null, jobs: {} };
}

function recordPreference(record) {
  const quality = { direct: 0, 'direct/unknown': 1, unknown: 2, staffing: 3, reposter: 4 }[record.source_quality] ?? 2;
  return [quality, record.description ? 0 : 1, record.source_posted_at ? 0 : 1, record.url?.length || 9999];
}

function preferRecord(a, b) {
  const pa = recordPreference(a), pb = recordPreference(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pa[i] < pb[i] ? a : b;
  }
  return a;
}

function mergeRecord(existing, incoming) {
  if (!existing) return incoming;
  const preferred = preferRecord(existing, incoming);
  const alternate = preferred === existing ? incoming : existing;
  return {
    ...alternate,
    ...preferred,
    canonical_key: existing.canonical_key || incoming.canonical_key,
    discovered_at: [existing.discovered_at, incoming.discovered_at].filter(Boolean).sort()[0] || null,
    last_seen_at: [existing.last_seen_at, incoming.last_seen_at].filter(Boolean).sort().at(-1) || null,
    source_posted_at: preferred.source_posted_at || alternate.source_posted_at || null,
    posted_precision: preferred.posted_precision && preferred.posted_precision !== 'unknown' ? preferred.posted_precision : alternate.posted_precision || 'unknown',
    posted_raw: preferred.posted_raw || alternate.posted_raw || '',
    description: (incoming.description || '').length >= (existing.description || '').length ? incoming.description : existing.description,
    compensation: incoming.compensation || existing.compensation || null,
    sponsorship: incoming.sponsorship || existing.sponsorship || '',
    no_sponsor: Boolean(existing.no_sponsor || incoming.no_sponsor),
    citizenship_required: Boolean(existing.citizenship_required || incoming.citizenship_required),
    active: incoming.active !== false,
  };
}

function readPipeline() {
  return existsSync(PIPELINE_PATH)
    ? readFileSync(PIPELINE_PATH, 'utf-8')
    : '# Pipeline — pending offers inbox\n\n## Pendientes\n';
}

function parsePipelineEntries(text) {
  return [...text.matchAll(/- \[[ x]\] (https?:\/\/\S+) \| ([^|]+) \|/g)].map((match) => ({ url: match[1], company: match[2].trim() }));
}

function readHistory() {
  return existsSync(HISTORY_PATH)
    ? readFileSync(HISTORY_PATH, 'utf-8')
    : 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\n';
}

async function acquireWriteLock(timeoutMs = 30000) {
  const started = Date.now();
  while (true) {
    try {
      const fd = openSync(WRITE_LOCK_PATH, 'wx');
      writeFileSync(fd, JSON.stringify({ pid: process.pid, acquired_at: new Date().toISOString() }));
      return fd;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        if (Date.now() - statSync(WRITE_LOCK_PATH).mtimeMs > LOCK_STALE_MS) {
          unlinkSync(WRITE_LOCK_PATH);
          continue;
        }
      } catch { continue; }
      if (Date.now() - started >= timeoutMs) throw new Error('another board/aggregator process is writing shared state');
      await sleep(250);
    }
  }
}

function releaseWriteLock(fd) {
  try { closeSync(fd); } catch { /* already closed */ }
  try { unlinkSync(WRITE_LOCK_PATH); } catch { /* already removed */ }
}

export function loadSeenJobKeys() {
  const keys = new Set();
  for (const entry of parsePipelineEntries(readPipeline())) keys.add(canonicalJobKey(entry.url, entry.company));
  for (const line of readHistory().split('\n').slice(1)) {
    const [url, , , , company] = line.split('\t');
    if (url) keys.add(canonicalJobKey(url, company));
  }
  for (const key of Object.keys(loadBoardStore().jobs)) keys.add(key);
  return keys;
}

/**
 * Earliest first_seen (from scan-history.tsv) per canonical key. Used to
 * backfill discovered_at for a record's first arrival in the store — the
 * history file predates board-jobs.json, so many "new" store records were
 * actually first discovered weeks/months earlier.
 */
function loadHistoryFirstSeen() {
  const firstSeen = new Map();
  for (const line of readHistory().split('\n').slice(1)) {
    const [url, seen, , , company] = line.split('\t');
    if (!url || !seen) continue;
    // history's first_seen is a date-only string (YYYY-MM-DD) — normalize to
    // midnight UTC so it is a real ISO timestamp, not a bare date string.
    const iso = toIsoTimestamp(`${seen}T00:00:00.000Z`);
    if (!iso) continue;
    const key = canonicalJobKey(url, company);
    const existing = firstSeen.get(key);
    if (!existing || iso < existing) firstSeen.set(key, iso);
  }
  return firstSeen;
}

/**
 * Append pre-formatted TSV lines to scan-history.tsv under the shared writer
 * lock. linkedin.mjs and indeed.mjs own lanes that never write pipeline.md/
 * board-jobs.json, but they share this same history file with scan.mjs/
 * aggregators.mjs — an unlocked appendFileSync here could be silently
 * clobbered by persistBoardOffers's read-modify-atomic-write cycle running
 * concurrently in another process.
 */
export async function appendHistoryRows(lines) {
  if (!lines.length) return;
  const fd = await acquireWriteLock();
  try {
    const history = readHistory().replace(/\n?$/, '\n');
    writeAtomic(HISTORY_PATH, `${history}${lines.join('\n')}\n`);
  } finally {
    releaseWriteLock(fd);
  }
}

/**
 * Persist newly observed offers while holding the shared writer lock. The
 * seen-set is rebuilt after acquiring the lock so overlapping scans cannot
 * append the same role twice.
 */
export async function persistBoardOffers(offers, {
  lane,
  blocklist = [],
  staffing = [],
  dryRun = false,
  observedAt = new Date().toISOString(),
} = {}) {
  const normalized = offers.filter((offer) => offer?.url && offer?.title).map((offer) => {
    const key = canonicalJobKey(offer.url, offer.company);
    return {
      canonical_key: key,
      url: offer.url,
      company: String(offer.company || 'Unknown').trim(),
      title: String(offer.title || '').trim(),
      location: String(offer.location || '').trim(),
      lane,
      source: String(offer.source || '').trim(),
      source_quality: sourceQualityFor(offer, blocklist, staffing),
      source_posted_at: toIsoTimestamp(offer.postedAt) || relativePostedTimestamp(offer.postedRaw, observedAt),
      posted_precision: offer.postedPrecision || 'unknown',
      posted_raw: String(offer.postedRaw || ''),
      discovered_at: observedAt,
      last_seen_at: observedAt,
      description: String(offer.description || '').slice(0, 20000),
      compensation: offer.compensation || null,
      sponsorship: String(offer.sponsorship || ''),
      no_sponsor: Boolean(offer.noSponsor),
      citizenship_required: Boolean(offer.citizenshipRequired),
      active: offer.active !== false,
    };
  });

  if (dryRun) {
    const seen = loadSeenJobKeys();
    const added = [];
    for (const record of normalized) if (!seen.has(record.canonical_key)) { seen.add(record.canonical_key); added.push(record); }
    return { added, duplicateCount: normalized.length - added.length, observed: normalized.length };
  }

  const fd = await acquireWriteLock();
  try {
    let pipeline = readPipeline();
    let history = readHistory();
    const store = loadBoardStore();
    const firstSeen = loadHistoryFirstSeen();
    const seen = new Set(Object.keys(store.jobs));
    for (const entry of parsePipelineEntries(pipeline)) seen.add(canonicalJobKey(entry.url, entry.company));
    for (const line of history.split('\n').slice(1)) {
      const [url, , , , company] = line.split('\t');
      if (url) seen.add(canonicalJobKey(url, company));
    }

    const added = [];
    let duplicateCount = 0;
    for (const record of normalized) {
      const existed = seen.has(record.canonical_key);
      // First arrival in board-jobs.json for a key that scan-history.tsv
      // already knew about (written before this store existed) — keep the
      // true first-seen date instead of stamping "discovered now".
      if (!store.jobs[record.canonical_key]) {
        const historyFirstSeen = firstSeen.get(record.canonical_key);
        if (historyFirstSeen && historyFirstSeen.slice(0, 10) < record.discovered_at.slice(0, 10)) record.discovered_at = historyFirstSeen;
      }
      store.jobs[record.canonical_key] = mergeRecord(store.jobs[record.canonical_key], record);
      if (existed) { duplicateCount++; continue; }
      seen.add(record.canonical_key);
      added.push(record);
    }

    if (added.length) {
      const lines = added.map((record) => `- [ ] ${record.url} | ${record.company} | ${record.title}`).join('\n');
      const index = pipeline.indexOf('## Pendientes');
      if (index === -1) pipeline += `\n## Pendientes\n\n${lines}\n`;
      else {
        const insertAt = pipeline.indexOf('\n', index) + 1;
        pipeline = `${pipeline.slice(0, insertAt)}\n${lines}${pipeline.slice(insertAt)}`;
      }
      const firstSeen = observedAt.slice(0, 10);
      const historyLines = added.map((record) => [
        record.url, firstSeen, record.source, record.title, record.company, 'added', record.location,
      ].map(cleanTsv).join('\t')).join('\n');
      history = `${history.replace(/\n?$/, '\n')}${historyLines}\n`;
      writeAtomic(PIPELINE_PATH, pipeline);
      writeAtomic(HISTORY_PATH, history);
    }

    store.updated_at = observedAt;
    writeAtomic(BOARD_STORE_PATH, `${JSON.stringify(store, null, 1)}\n`);
    return { added, duplicateCount, observed: normalized.length };
  } finally {
    releaseWriteLock(fd);
  }
}
