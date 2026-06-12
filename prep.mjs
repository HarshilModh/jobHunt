#!/usr/bin/env node
/**
 * prep.mjs — interview-prep scaffold (zero tokens).
 *
 * Given a company, pulls the matching opening from your leaderboards, lists the
 * story-bank stories that map to the common new-grad question buckets, and
 * writes a starter prep doc to interview-prep/{company}.md.
 *
 * This is the zero-token starting point. For the deep, company-specific version
 * (real process research, JD-mapped questions), open `claude` here and say
 * "prep me for {company}" — that reads this scaffold + does the web research.
 *
 * Usage:
 *   node prep.mjs Notion
 *   node prep.mjs "Hudson River Trading"
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';

const company = process.argv.slice(2).join(' ').trim();
if (!company) {
  console.log('Usage: node prep.mjs <company>   e.g. node prep.mjs Notion');
  process.exit(0);
}

// ── Find the role from the leaderboards ─────────────────────────────

function findRole(name) {
  for (const path of ['data/top-openings.md', 'data/linkedin-openings.md']) {
    if (!existsSync(path)) continue;
    for (const m of readFileSync(path, 'utf-8').matchAll(/\| *(?:\*\*)?(\d+|—)(?:\*\*)? *\| *(\d+) *\| *([^|]+?) *\| *\[([^\]]+)\]\(([^)]+)\) *\|/g)) {
      if (m[3].trim().toLowerCase().includes(name.toLowerCase()))
        return { ai: m[1], heur: m[2], company: m[3].trim(), role: m[4].trim(), url: m[5] };
    }
  }
  return null;
}

// ── Map story-bank stories to question buckets ──────────────────────

function loadStories() {
  if (!existsSync('data/story-bank.md')) return [];
  const text = readFileSync('data/story-bank.md', 'utf-8');
  const stories = [];
  for (const m of text.matchAll(/^### (.+?)\n[\s\S]*?\*\*Best for questions about:\*\* (.+)$/gm))
    stories.push({ title: m[1].replace(/\s*\*\(draft.*?\)\*/, '').trim(), tags: m[2].trim() });
  return stories;
}

const BUCKETS = [
  { q: 'Tell me about yourself', match: /impact|ownership|yourself/i },
  { q: 'Most impactful / proud project', match: /impactful|proud|project/i },
  { q: 'Hardest technical problem', match: /technical|hardest|concurrency|system design/i },
  { q: 'A hard bug you debugged', match: /debug|bug|async/i },
  { q: 'A trade-off / tough decision', match: /trade-off|decision|defending/i },
  { q: 'A time you failed / a mistake', match: /fail|mistake|differently/i },
  { q: 'Conflict / disagreement', match: /conflict|disagree|push/i },
  { q: 'Leadership / helping others', match: /leadership|mentor|collaborat|initiative/i },
  { q: 'Learning something quickly', match: /learn|ambiguity|self-direct/i },
];

// ── Build the scaffold ──────────────────────────────────────────────

const role = findRole(company);
const stories = loadStories();
const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
mkdirSync('interview-prep', { recursive: true });
const out = [`# Interview Prep — ${company}`, ``];

if (role) out.push(`**Role:** ${role.role}`, `**Posting:** ${role.url}`, `**Fit score:** ${role.ai !== '—' ? `AI ${role.ai}` : `heuristic ${role.heur}`}/100`, ``);
else out.push(`*(No matching opening found in your leaderboards — add the role/URL manually.)*`, ``);

out.push(`## Behavioral — your story for each likely question`, ``, `| Likely question | Your best story |`, `|-----------------|-----------------|`);
for (const b of BUCKETS) {
  // Prefer a story whose [Theme] title matches the bucket; fall back to tags.
  const hit = stories.find((s) => b.match.test(s.title)) || stories.find((s) => b.match.test(s.tags));
  out.push(`| ${b.q} | ${hit ? hit.title : '⚠️ no story yet — draft one'} |`);
}

out.push(
  ``, `## Technical checklist (the new-grad gate)`, ``,
  `- [ ] DSA: 2–3 problems on this company's common topics (check Glassdoor/LeetCode discuss)`,
  `- [ ] Be able to whiteboard the architecture of ONE project (CareConnect or CodePulse)`,
  `- [ ] Know your numbers cold (50% latency cut, <60s health score, 1,369 weekly downloads)`,
  `- [ ] 2–3 sharp reverse questions about *this* team (from their eng blog / recent launches)`,
  ``, `## Sponsorship (F-1 / OPT from May 2026)`, ``,
  `- [ ] Confirm the role sponsors before the recruiter screen (don't volunteer it; ask if they raise work auth)`,
  ``, `---`, ``,
  `> Zero-token scaffold. For the deep version — real interview process, JD-mapped questions,`,
  `> company research — open \`claude\` here and say **"prep me for ${company}"**.`, ``,
);

const path = `interview-prep/${slug}.md`;
writeFileSync(path, out.join('\n'), 'utf-8');
console.log(`✓ ${path}`);
if (role) console.log(`  ${role.company} — ${role.role}`);
console.log(`  ${stories.length} stories mapped. Deep version: open claude → "prep me for ${company}"`);
