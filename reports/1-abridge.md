# Abridge — Junior Software Engineer (Early Career)

> **Title note:** Same req (LinkedIn job `4440084829`, $167K–$184K, SF onsite) — Abridge retitled it on LinkedIn from "Junior Software Engineer" to **"Member of Technical Staff, Early Career"** (reposted ~1 week ago). JD text is unchanged; confirmed live on 2026-10-03.

**Score:** 4.5/5 (AI 98/100 · heuristic 40/100)
**Legitimacy:** High Confidence
**Sponsorship risk:** None flagged — no "no sponsorship / citizenship / clearance" language anywhere in the JD or application emails. Comp range disclosed ($167K–$184K), onsite SF, equity — a normal full-time funded-startup req, not a visa-restricted one.

**Status:** Already in process — applied 2026-09-21 (Ashby), moved to CoderPad technical assessment same day, due ~2026-10-05. This report is for interview prep, not an apply decision.

Links: [LinkedIn posting](https://www.linkedin.com/jobs/view/4440084829) · [Ashby confirmation thread] · CoderPad assessment (in your inbox, Sep 21)

---

## A · Role

**Archetype:** AI-ML / Full-Stack hybrid, early-career/new-grad band. Onsite 5 days/week, SF (Mission District).

**TL;DR:** Build production features on Abridge's clinical-conversation AI platform — backend/frontend systems, agentic LLM pipelines (retrieval, tool use, chained workflows), and the eval/observability infrastructure that keeps those LLM workflows reliable in a regulated healthcare setting.

## B · Fit vs CV

| JD requirement | CV evidence |
|---|---|
| Hands-on GenAI: integrated an LLM API, built a RAG pipeline, experimented with agents | **PromptStudio** — 3-agent pipeline via `@inngest/agent-kit`, Zod-validated tool use, OpenAI API. **CodePulse** — tool-calling RAG chat (6 tools), pgvector cosine search over embeddings for drift detection. |
| LLM orchestration concepts (prompt chaining, tool use, retrieval) | PromptStudio's 10-iteration agent routing loop; CodePulse's multi-agent refactor debate + MCP exposure. Direct match — this is literally what both projects do. |
| Contribute to backend AND frontend systems | CareConnect (full MERN stack), CodePulse (Next.js dashboard + 5-worker backend), PromptStudio (split-pane IDE frontend + Inngest backend). Strong on both sides. |
| Evaluation frameworks (accuracy, robustness, reliability, human-in-the-loop) | TA automated grading framework (asserts HTTP responses, JSON contracts, DB state) — not LLM eval specifically, but the "build a framework that scores correctness deterministically" muscle transfers directly. Partial match. |
| Monitoring/observability for LLM workflows in production | CodePulse streams a weighted health score via SSE/Socket.IO with sub-60s latency targets — adjacent (pipeline observability, not LLM-specific). **Gap.** |
| AI tooling already part of how you work, know when to trust vs. verify | Cursor, GitHub Copilot listed on CV; PromptStudio/CodePulse built *using* AI coding assistance on AI-output-generating systems — good authentic story here. |
| CS degree or equivalent | MS CS, Stevens, 3.86 GPA. Exceeds. |

**Gaps:**
- **LLM-specific eval/observability** (not general software observability) — learnable; this is exactly the "growing fast" the JD promises, not a blocker for an early-career req.
- **Healthcare/clinical domain** — no direct healthcare experience. Not a hard blocker (JD doesn't require it), but worth a sentence on why healthcare AI specifically interests you (high-stakes correctness, "Linked Evidence" ground-truth mapping resonates with your CareConnect safety-framing instinct).
- **LangChain/LlamaIndex named tools** — you've built equivalent orchestration (Inngest agent-kit, custom tool-calling) but not these specific libraries. Mention you built the same patterns from scratch, which is arguably a stronger signal than library familiarity.

## C · Level & Strategy

Genuinely entry-level — the JD explicitly says "early-career," "degree or equivalent," and frames onboarding as "accelerated learning," not stretch-level ownership from day one. Your profile (strong agentic-AI project depth + TA mentoring scale) is at or above the bar for this band. Position yourself as someone who can skip the ramp-up most early-career hires need on "what is a RAG pipeline" — you've shipped three of them. Don't undersell: lean into project depth as a proxy for the production maturity they're hoping to get out of someone without big-company experience.

## D · Comp & Demand

**This exact posting discloses $167K–$184K base** (LinkedIn JD footer) + equity, SF. Levels.fyi's $324K median for "Software Engineer" at Abridge is pulled from a small sample (13 submissions) skewed senior — not representative of this early-career band. Glassdoor's ~$148K figure is largely from a *different, unrelated* company ("Abridge Info Systems") — disregard it. Trust the JD's own disclosed range over either third-party aggregator here.

## E · How to Apply / Emphasize

(Already applied — for the technical assessment and any later recruiter/HM conversation, lead with:)
1. **Agentic AI project depth** — PromptStudio's multi-agent routing loop and CodePulse's tool-calling RAG chat are closer to "production agentic LLM system" than most early-career candidates will show.
2. **Reliability-under-constraint instinct** — CareConnect's zero-missed-alert fan-out design maps directly to the "dependable clinical systems" framing in the JD; healthcare is a domain where "it mostly works" isn't good enough, and you've already built for that bar once.
3. **Ships fast, documents for others** — `canvas-grade-manager` (published to npm, used by 150+ students) shows you turn personal tools into real artifacts other people depend on, which is the "startup operating at scale" instinct they're hiring for.

## F · Interview Angle

Likely strong matches from `data/story-bank.md`:
- **PromptStudio — "Building on unfamiliar agent infrastructure"** → directly answers "tell us about agentic/LLM work you've done" and "learning something quickly."
- **CodePulse — "5 parallel workers under a 60-second budget"** → strong for "hardest technical problem" and reliability/observability framing.
- **CareConnect — "the parallel panic-alert system"** → best for "why healthcare AI" / reliability-at-stakes framing, even though it's not a healthcare project — the safety-criticality parallel is real.

**Gap:** no story currently maps to "a time you evaluated/debugged an LLM's output for correctness" specifically (vs. general software correctness). If asked directly, bridge from the TA automated-grading story (deterministic correctness checking) rather than forcing a fake LLM-eval anecdote.

## G · Posting Legitimacy (Ghost-Job Check) — High Confidence

- Posted 2026-09-21, JD is highly specific (named tech: LangChain/LlamaIndex, named workflow stages, explicit onsite policy, disclosed comp band) — not boilerplate.
- Requirements match the entry-level title honestly (no senior-level asks disguised as "early career").
- Company context: Abridge closed a $300M Series E in mid-2025, ~539 employees, ~121 open roles as of Sep 2026, no WARN/layoff filings on record, actively expanding healthcare-AI product (Sep 2026 product release blog post). No hiring-freeze signal.
- You're not speculating from the posting alone — you have a live, moving application (confirmed receipt → technical assessment within the same day), which is itself strong evidence this req is real and actively being worked.

Sources: [Abridge Software Engineer Salary (Levels.fyi)](https://www.levels.fyi/companies/abridge/salaries/software-engineer) · [Abridge Salaries (Glassdoor)](https://www.glassdoor.com/Salary/Abridge-Salaries-EI_IE3146134.0,7.htm) · [Abridge September 2026 product release](https://www.abridge.com/blog/now-in-practice-september-2026)

---

## Why the heuristic score (40) understates this one

Worth noting for `rank.mjs` calibration: the 🎓 new-grad regex in `rank.mjs:456` matches `new grad|early career|entry.level|...` but not the literal word **"junior"** — so this posting's title ("Junior Software Engineer") missed the +20 new-grad bonus entirely even though the JD body explicitly says "early-career Software Engineers." It also loses the 🗽 NY bonus (role is SF). Both are title/location string-matching misses, not a real fit problem — the AI score (98) correctly read the JD body and is the one to trust here. Consider adding `junior` to the new-grad regex.
