# jobhunt — agent instructions

A clean, self-contained job-search tool for Harshil Modh (MS CS, Stevens, new-grad/intern
SWE, F-1/OPT from May 2026, NYC-priority). Scans job boards + LinkedIn, ranks openings
against the profile, finds referrals. **No CV/PDF generation, no auto-apply.**

## Files

| File | Purpose |
|------|---------|
| `config.yml` | Single config: `profile`, `referral_networks`, `title_filter`, `location_filter`, `linkedin`, `companies` |
| `cv.md` | Resume (scoring input) |
| `jobhunt.mjs` | Interactive CLI: scan + LinkedIn + rank |
| `scan.mjs` | Board scanner (greenhouse/ashby/lever/workable/workday) → `data/pipeline.md` |
| `linkedin.mjs` | LinkedIn discovery → `data/linkedin-jds.json` |
| `rank.mjs` | Heuristic + optional Gemini scoring → `data/top-openings.md`, `data/linkedin-openings.md` (full) |
| `linkedin-recent.mjs` | Windowed LinkedIn slice → `data/linkedin-recent.md` (chosen freshness, replaced each run) |
| `referrals.mjs` | Referral worksheet (`--followups`, `--email`) → `data/referral-targets.md`, `data/referrals.md` |
| `prep.mjs` | Interview-prep scaffold → `interview-prep/{company}.md` (maps `data/story-bank.md` to question buckets) |
| `today.mjs` | Daily briefing: apply-first + referral nudges + app follow-ups + pipeline counts |
| `keywords.mjs` | JD-vs-`cv.md` skill gap for a job URL/company |
| `data/story-bank.md` | 8 STAR+R stories from his real projects |
| `people-grabber.js` + `make-bookmarklet.mjs` | LinkedIn People Grabber bookmarklet |
| `data/applications.md` | Application tracker |

## Rules (override defaults)

1. **Never** generate CVs, PDFs, HTML, LaTeX, or cover letters unless explicitly asked.
2. When customizing (companies, filters, networks, profile), edit `config.yml` — never hardcode.
3. F-1/OPT: flag any "no sponsorship / citizenship / clearance" language prominently.

## Scoring philosophy — two signals, both kept

The leaderboards carry two numbers and **both matter** — keep using and showing both:

- **AI score (Gemini, primary for the decision):** reads the full JD vs the résumé and judges
  real fit. This is the number to lean on when deciding what to apply to, and when the two
  disagree, trust the AI's JD-level judgment over raw keyword counts.
- **Heuristic score (keep it — he likes this technique):** the deterministic signal — company
  tier, title fit, NY-first location, skill overlap, experience-ask penalty, sponsorship
  language, salary, freshness. It's fast, transparent, and powers the 🎓/🗽/✅/⚠️/🆕 flags he
  reads at a glance. It also catches things the AI can miss (e.g. it flagged a no-sponsor role
  the AI under-penalized).

So: **lead with the AI score for the apply decision, but always present the heuristic alongside
it** and use it as the deterministic cross-check. Don't demote or hide the heuristic — when
they diverge, that divergence is signal (look at both). When you write an X.X/5 evaluation,
let it reflect a holistic JD read, informed by both numbers.

## "evaluate top N" — condensed A–G evaluation

When the user says "evaluate top 3" (any N, default 3): read `data/top-openings.md`, take the
top N rows from the Apply-first table, **skip any flagged ⚠️ no-sponsor**, fetch each posting,
and write each to `reports/{n}-{company}.md`. Header: `**Score:** X.X/5 (NN/100)`,
`**Legitimacy:** {tier}`, and a sponsorship-risk line at the top. Then cover these blocks
(tight — a few lines each, not an essay):

- **A · Role:** archetype (Backend / Full-Stack / AI-ML / Infra / Frontend), seniority, remote/onsite, 1-line TL;DR.
- **B · Fit vs CV:** table mapping each key JD requirement → the exact `cv.md` line that meets it (or "gap"). Then a short **Gaps** list: for each, is it a hard blocker or learnable, and the honest mitigation.
- **C · Level & strategy:** is this genuinely new-grad/entry, or stretch? How to position; if they down-level, when to accept vs push.
- **D · Comp & demand:** WebSearch Levels.fyi / Glassdoor for the band; state the range or say "no data" — never invent numbers.
- **E · How to apply:** the 2–3 things to emphasize in the application for THIS role, drawn from his strengths.
- **F · Interview angle:** which 2–3 `data/story-bank.md` stories map to this JD; flag any gap with no story.
- **G · Posting legitimacy (ghost-job check):** judge whether this is a real, active opening. Signals: posting age/freshness, JD specificity (named tech/team/scope vs boilerplate), realistic requirements (entry title vs senior asks), recent layoffs/hiring-freeze news for the company. Output one tier — **High Confidence** / **Proceed with Caution** / **Suspicious** — with the signals behind it. Present observations, not accusations; every signal has innocent explanations. Default to "Proceed with Caution" when data is thin; never "Suspicious" without evidence. Evergreen/pipeline reqs and big-company always-open roles are not ghost jobs — note them as context.

No PDF, no CV rewrite. Append a row to `data/applications.md`. End with one table summarizing all N scores + legitimacy tiers.

## "prep me for {company}" (interview prep)

Start from the scaffold: run `node prep.mjs {company}` (or read `interview-prep/{company}.md` if
it exists). Then deepen it and write the enriched doc back to `interview-prep/{company}.md`:

1. **Research the process** (WebSearch: Glassdoor / Blind / LeetCode discuss): number of rounds,
   format, difficulty, reported questions. **Cite each source or tag `[inferred from JD]` —
   never fabricate questions or ratings.**
2. **Audience-map each round** — prep differs by who's in the room:
   - `recruiter-screen` (first call): fit gate — motivation, comp, location/visa, timeline. Wrong-footed answers end it before any technical signal. Prep a 60–90s "why you / why now," a comp range (from research, deferring cleanly if leverage is thin), "why this company" from a real signal, and the F-1/OPT line.
   - `hiring-manager`: why this role, scope fit, ownership. Connect his narrative to a named team challenge.
   - `peer-tech`: depth + collaboration on the actual stack — coding, system design, his projects' internals.
   - `panel-mixed` (onsite loop): prep all three, capped to top items; vary the angle across slots, don't repeat the same proof point verbatim.
3. **Map `data/story-bank.md` → likely questions** per audience; flag any question with no story.
4. **Technical checklist** (max ~8) of what THIS company actually tests, by frequency.

Ground every STAR story in his real projects (CareConnect, CodePulse, PromptStudio, Grownited
TA) — never hypotheticals. If the *Failure*/*Conflict* stories are still drafts, prompt him to
confirm the real details first.

## "draft outreach to {person}" (referral / networking message)

For a LinkedIn DM or email to a specific person, use a 3-sentence frame and adapt the emphasis
to who they are (the structure stays; the emphasis changes). Keep a LinkedIn note ≤300 chars;
email can be longer. Never corporate-speak, never "I'm passionate about," never share his phone.

- **Recruiter:** (1) direct fit — role + relevant experience + availability; (2) one proof
  point that pre-answers a screening question; (3) "happy to share my resume if this aligns."
- **Hiring manager:** (1) a specific challenge their team faces (from JD/blog/news); (2) his
  best quantified achievement showing he's solved something similar; (3) a question about how
  they're approaching that challenge.
- **Peer engineer (referral):** (1) genuine reference to their work/team; (2) a shared-school
  (Stevens/LDRP) or shared-stack connection; (3) the small ask — "would you be open to
  referring me, or pointing me to the right person?" Don't lead with the job.

He sends every message himself. See also `referrals.mjs` for the per-company drafts and search
links.
