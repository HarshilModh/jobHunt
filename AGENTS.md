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
| `aggregators.mjs` | Open-ended discovery beyond the company list (SimplifyJobs new-grad + intern); same filters, F-1 citizenship-required drop → `data/pipeline.md` |
| `linkedin.mjs` | LinkedIn discovery → `data/linkedin-jds.json` |
| `rank.mjs` | Heuristic + optional Gemini scoring → `data/top-openings.md`, `data/linkedin-openings.md` (full) |
| `linkedin-recent.mjs` | Windowed LinkedIn slice → `data/linkedin-recent.md` (chosen freshness, replaced each run) |
| `referrals.mjs` | Referral worksheet (`--followups`, `--email`) → `data/referral-targets.md`, `data/referrals.md` |
| `prep.mjs` | Interview-prep scaffold → `interview-prep/{company}.md` (maps `data/story-bank.md` to question buckets) |
| `today.mjs` | Daily briefing: apply-first + referral nudges + app follow-ups + pipeline counts |
| `keywords.mjs` | JD-vs-`cv.md` skill gap for a job URL/company |
| `liveness.mjs` | Is a posting still open? `node liveness.mjs <url>` or `--top N` → `data/liveness-report.md` |
| `dsa.mjs` | A company's most-asked LeetCode problems (GitHub LeetCode-company-tags mirror) → `data/dsa-{company}.md` |
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

## "prep me for {company}" (interview prep — FULL, always research-backed)

This is a full prep, never a skeleton. Do real research and write a complete intel doc to
`interview-prep/{company}.md`. (`prep.mjs` only exists as an offline fallback when there's no
network — don't use it as the starting point; go straight to the research below.) Read
`data/story-bank.md`, `cv.md`, and any matching `reports/{n}-{company}.md` first.

**Step 0 — Calibrate before researching (this reshapes everything).** A recruiter screen
tomorrow and a full onsite in two weeks are different documents. If he hasn't already said,
ask three quick things in one message:
- **Which round is this?** (recruiter screen / technical phone / onsite loop / unsure)
- **When is it?** (date — drives how much to prep and in what order)
- **Who's it with, if known?** (name/title — lets me LinkedIn-map them to an audience)

If he doesn't know, default to "full process from the top" but **prep the nearest round
deepest** and keep later rounds lighter. Don't dump equal depth on every round — weight the
prep to where he actually is.

**New-grad calibration (applies throughout):** entry/new-grad loops are coding + behavioral
heavy, system design light-to-none (one light design chat at most, usually not a full one).
Don't over-prep distributed-systems design for a new-grad role; do over-prep LeetCode patterns,
"tell me about a project," and the F-1 questions. If the role is genuinely senior/stretch, flip
this and say so.

1. **Research the process** — WebSearch across audiences, **cite every claim or tag
   `[inferred from JD]`; never fabricate a question, rating, or stat:**
   - Comp band: `"{company} {role} salary" site:levels.fyi` and `site:glassdoor.com/Salary`.
   - Process + questions: `"{company} interview process site:glassdoor.com"`,
     `"{company} {role} interview questions site:glassdoor.com"`,
     `"{company} {role} interview site:leetcode.com/discuss"`, `site:teamblind.com`.
   - Team context: `"{company} engineering blog"`, recent news / launches / layoffs (last 12 mo).
   - If an interviewer name was given: look them up (LinkedIn/blog/GitHub) and tag their audience.
   If intel is thin (small company), say so and lean on JD-inferred questions tagged clearly.

2. **Process overview** — rounds, end-to-end timeline, format, difficulty (X/5 with review
   count), known quirks (pair-programming / take-home / no-LeetCode). Write "unknown — not
   enough data" rather than guessing.

3. **Audience-map each round** — prep differs by who's in the room. Round 1 short call →
   `recruiter-screen`; deep coding/design block → `peer-tech`; manager/skip-level →
   `hiring-manager`; onsite loop → `panel-mixed`. Tag inferred classifications `[inferred]`.
   - `recruiter-screen`: fit gate — motivation, comp, location/visa, timeline. Prep a 60–90s
     "why you / why now," a comp range (defer cleanly if leverage is thin), "why this company"
     from a real signal, and the F-1/OPT line.
   - `hiring-manager`: why this role, scope fit, ownership, first-90-days; connect his narrative
     to a *named* team challenge from research. 2–3 sharp reverse questions tied to recent work.
   - `peer-tech`: depth + collaboration on the actual stack — coding, system design, his
     projects' internals. Reverse questions on on-call / code review / deploy cadence.
   - `panel-mixed` (onsite loop): prep all three packs capped to top items; vary the angle
     across slots — never repeat the same proof point verbatim; don't contradict on comp/timeline.

4. **Round-by-round breakdown** — for each round: duration, who runs it, what they evaluate,
   reported questions (with source), and 1–2 concrete prep actions. **Go deepest on the round
   he's actually in next**; keep the rest as a lighter heads-up.

5. **Likely questions for the target round** + draft answers grounded in his real projects
   (CareConnect, CodePulse, PromptStudio, Grownited TA) — never hypotheticals. Always include
   the new-grad staples: "tell me about yourself," "walk me through a project you're proud of,"
   "a hard bug you debugged," "a time you disagreed with someone," "a failure."

6. **Map `data/story-bank.md` → likely questions** (strong / partial / none); for every "none,"
   name the gap and propose a real experience that could become a STAR+R story.

7. **DSA** — run `node dsa.mjs {company}` and fold its most-asked problems + patterns-to-drill
   into the coding section. Flag the 3–4 patterns to drill first given the time before the round.

8. **Technical checklist** (max ~10) of what THIS company actually tests, ordered by frequency.

9. **Company signals per audience** — what to volunteer / avoid and the vocabulary to use with
   the recruiter vs HM vs peer panel.

10. **Prioritized action plan (close with this — the most useful part).** Convert all of the
    above into a time-boxed to-do list scaled to days-until-interview:
    - **≤24h:** the 3–5 highest-leverage things only (lock the "why you / why this company,"
      rehearse 2 stories out loud, drill the single most-common DSA pattern, prep the F-1 line).
      Don't hand him the whole essay the night before.
    - **2–5 days:** all stories tight + ~10–15 targeted LeetCode + reverse questions.
    - **1–2 weeks:** full breadth — every round, full DSA set, mock loops.
    Then a short **night-before / day-of** checklist (logistics, what to re-read, reverse
    questions ready, F-1 answer rehearsed).

If the *Failure*/*Conflict* stories in `data/story-bank.md` are still drafts, prompt him to
confirm the real details before relying on them. Close by asking if he wants a mock loop
("mock interview me for {company}") or stories drafted for any gaps.

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

## "mock interview me for {company}" (behavioral practice loop)

Run a real practice loop, ONE question at a time — do not dump a list. For each:
1. Ask a single likely question (pull from `interview-prep/{company}.md` if it exists, else from
   the role's archetype + common new-grad behavioral/technical questions).
2. Wait for his answer.
3. Critique it honestly: was it specific (real numbers/actions from his projects, not vague)?
   Structured (STAR)? Did it land a clear result + reflection? Flag rambling, hedging, or missing
   ownership. Suggest the sharper version, grounded in `data/story-bank.md`.
4. Then the next question. ~6–8 questions, mixing recruiter-screen, behavioral, and 1–2 light
   technical. End with a short scorecard (strengths + the 2 things to fix before the real thing).

Keep it brisk and honest — this is practice, not a pep talk.

## Red-flag questions (the uncomfortable ones)

When prepping or mock-interviewing, always cover the questions an F-1 new grad gets and is
caught off-guard by. Help him build honest, confident, non-defensive answers:
- **"Do you need visa sponsorship?"** — straight, factual: F-1, OPT from May 2026, STEM-eligible
  for the extension, comfortable being on the team for years. Never apologetic.
- **"You've only had a 6-month internship."** — pivot to project depth (CareConnect, CodePulse,
  PromptStudio) + TA scale (100+ students), framed as shipped, owned, measured work.
- **"Why should we pick you over a candidate who doesn't need sponsorship?"** — the work speaks;
  redirect to a specific, quantified strength, not a plea.
- **Any résumé gap / transition** — honest, forward-looking, one sentence, no over-explaining.

## Story bank — needs his input

`data/story-bank.md` has 8 stories, but the **Failure** and **Conflict** ones are still drafts.
Before any real interview, prompt him to confirm the actual experiences behind those two — they
must be real and defensible. Don't invent specifics; ask him.
