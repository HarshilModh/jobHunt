#!/usr/bin/env node
/**
 * keywords.mjs — JD vs résumé keyword gap (zero tokens).
 *
 * Fetches a job description, finds the technical skills it mentions, and shows
 * which ones are NOT in your cv.md — so you can decide whether to add a real,
 * honest mention before applying. No rewriting, no PDF: just the gap.
 *
 * Usage:
 *   node keywords.mjs <job-url>     # greenhouse / ashby / lever / workday / linkedin (cached)
 *   node keywords.mjs Notion        # or a company name → uses its top opening's URL
 */

import { readFileSync, existsSync } from 'fs';

const arg = process.argv.slice(2).join(' ').trim();
if (!arg) { console.log('Usage: node keywords.mjs <job-url | company>'); process.exit(0); }

// Tech vocabulary — only these count as "keywords" (skips JD boilerplate).
// Each entry: canonical label + regex of how it appears in text.
const VOCAB = [
  ['JavaScript', /\bjavascript\b/i], ['TypeScript', /\btypescript\b/i], ['Python', /\bpython\b/i],
  ['Java', /\bjava\b(?!script)/i], ['Go', /\b(golang|go)\b/i], ['Rust', /\brust\b/i], ['C++', /\bc\+\+\b/i],
  ['C#', /\bc#\b/i], ['Ruby', /\bruby\b/i], ['Scala', /\bscala\b/i], ['Kotlin', /\bkotlin\b/i],
  ['SQL', /\bsql\b/i], ['GraphQL', /\bgraphql\b/i], ['React', /\breact(\.js)?\b/i], ['Next.js', /\bnext\.?js\b/i],
  ['Vue', /\bvue(\.js)?\b/i], ['Angular', /\bangular\b/i], ['Svelte', /\bsvelte\b/i], ['Node.js', /\bnode(\.js)?\b/i],
  ['Express', /\bexpress(\.js)?\b/i], ['Django', /\bdjango\b/i], ['Flask', /\bflask\b/i], ['FastAPI', /\bfastapi\b/i],
  ['Spring', /\bspring\b/i], ['Rails', /\brails\b/i], ['REST', /\brest(ful)?\b/i], ['gRPC', /\bgrpc\b/i],
  ['MongoDB', /\bmongo(db)?\b/i], ['PostgreSQL', /\bpostgres(ql)?\b/i], ['MySQL', /\bmysql\b/i],
  ['Redis', /\bredis\b/i], ['Cassandra', /\bcassandra\b/i], ['DynamoDB', /\bdynamodb\b/i],
  ['Elasticsearch', /\belasticsearch\b/i], ['Kafka', /\bkafka\b/i], ['RabbitMQ', /\brabbitmq\b/i],
  ['Prisma', /\bprisma\b/i], ['pgvector', /\bpgvector\b/i], ['Docker', /\bdocker\b/i],
  ['Kubernetes', /\b(kubernetes|k8s)\b/i], ['Terraform', /\bterraform\b/i], ['AWS', /\baws\b/i],
  ['GCP', /\b(gcp|google cloud)\b/i], ['Azure', /\bazure\b/i], ['CI/CD', /\bci\/?cd\b/i],
  ['GitHub Actions', /\bgithub actions\b/i], ['Jenkins', /\bjenkins\b/i], ['Linux', /\blinux\b/i],
  ['Microservices', /\bmicroservices?\b/i], ['Distributed systems', /\bdistributed systems?\b/i],
  ['gRPC', /\bgrpc\b/i], ['WebSockets', /\b(websocket|socket\.io)\b/i], ['Serverless', /\bserverless\b/i],
  ['Machine learning', /\bmachine learning\b/i], ['LLM', /\b(llm|large language model)\b/i],
  ['RAG', /\brag\b/i], ['OpenAI', /\bopenai\b/i], ['PyTorch', /\bpytorch\b/i], ['TensorFlow', /\btensorflow\b/i],
  ['Embeddings', /\bembeddings?\b/i], ['Vector search', /\bvector (search|database|db)\b/i],
  ['Tailwind', /\btailwind\b/i], ['Redux', /\bredux\b/i], ['Jest', /\bjest\b/i], ['Playwright', /\bplaywright\b/i],
  ['Cypress', /\bcypress\b/i], ['Webpack', /\bwebpack\b/i], ['Vite', /\bvite\b/i],
  ['JWT', /\bjwt\b/i], ['OAuth', /\boauth\b/i], ['RBAC', /\brbac\b/i], ['gRPC', /\bgrpc\b/i],
  ['Stripe', /\bstripe\b/i], ['Firebase', /\bfirebase\b/i], ['Snowflake', /\bsnowflake\b/i],
  ['Spark', /\bspark\b/i], ['Airflow', /\bairflow\b/i], ['dbt', /\bdbt\b/i],
];

// ── Fetch JD text from the URL ──────────────────────────────────────

const decode = (s) => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
const strip = (s) => decode(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

async function getJson(url, timeoutMs = 30000, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers: { 'user-agent': 'jobhunt/1.0' }, ...opts });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally { clearTimeout(t); }
}

function urlForCompany(name) {
  for (const path of ['data/top-openings.md', 'data/linkedin-openings.md']) {
    if (!existsSync(path)) continue;
    for (const m of readFileSync(path, 'utf-8').matchAll(/\| *([^|]+?) *\| *\[([^\]]+)\]\((https?:[^)]+)\) *\|/g))
      if (m[1].trim().toLowerCase().includes(name.toLowerCase())) return m[3];
  }
  return null;
}

async function fetchJd(url) {
  // LinkedIn — use the cached description
  if (/linkedin\.com/.test(url) && existsSync('data/linkedin-jds.json')) {
    const cache = JSON.parse(readFileSync('data/linkedin-jds.json', 'utf-8'));
    if (cache[url]?.desc) return cache[url].desc;
  }
  let m;
  if ((m = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)\/jobs\/(\d+)/)) || (m = url.match(/greenhouse\.io\/embed\/job_app\?.*jobs\/(\d+)/))) {
    const slug = m[1], id = m[2];
    const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs/${id}`);
    return strip(j.content || '');
  }
  if ((m = url.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/([a-f0-9-]+)/))) {
    const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${m[1]}?includeCompensation=true`);
    const post = (j.jobs || []).find((x) => x.jobUrl === url || x.id === m[2]);
    return strip(post?.descriptionHtml || post?.description || '');
  }
  if ((m = url.match(/jobs\.lever\.co\/([^/?#]+)\/([a-f0-9-]+)/))) {
    const j = await getJson(`https://api.lever.co/v0/postings/${m[1]}/${m[2]}?mode=json`);
    return strip(j?.descriptionPlain || j?.description || '');
  }
  if ((m = url.match(/^https:\/\/([a-z0-9-]+)\.(wd\d+)\.myworkdayjobs\.com\/[a-z]{2}-[A-Z]{2}\/([^/]+)(\/job\/.+)$/))) {
    const j = await getJson(`https://${m[1]}.${m[2]}.myworkdayjobs.com/wday/cxs/${m[1]}/${m[3]}${m[4]}`, 20000);
    return strip(j?.jobPostingInfo?.jobDescription || '');
  }
  return null;
}

// ── Main ────────────────────────────────────────────────────────────

const url = /^https?:\/\//.test(arg) ? arg : urlForCompany(arg);
if (!url) { console.log(`No URL — pass a job link, or a company that's in your leaderboards.`); process.exit(0); }

const jd = await fetchJd(url);
if (!jd) {
  console.log(`Couldn't fetch the JD for this URL (unsupported source). Paste the JD text into Claude Code and ask for a keyword gap instead.`);
  process.exit(0);
}

const cv = existsSync('cv.md') ? readFileSync('cv.md', 'utf-8') : '';
const inJd = VOCAB.filter(([, re]) => re.test(jd)).map(([label]) => label);
const have = [], missing = [];
for (const label of [...new Set(inJd)]) {
  const re = VOCAB.find(([l]) => l === label)[1];
  (re.test(cv) ? have : missing).push(label);
}

console.log(`\n🔑  Keyword gap vs cv.md\n   ${url}\n`);
console.log(`✅ JD skills you already have (${have.length}): ${have.join(', ') || '—'}`);
console.log(`\n⚠️  JD skills MISSING from your résumé (${missing.length}):`);
if (!missing.length) console.log('   none — your résumé covers this JD well.');
else {
  console.log(`   ${missing.join(', ')}`);
  console.log(`\n   → Only add ones you can honestly back up. A missing skill you DO have = quick win`);
  console.log(`     (add it to cv.md). A missing skill you DON'T have = a real gap to weigh.`);
}
console.log('');
