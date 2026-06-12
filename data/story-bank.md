# Story Bank — STAR+R

Your reusable interview stories, grounded in your real projects. Maintain ~8 deep stories
instead of memorizing 100 answers — each one bends to several questions.

> ⚠️ These are drafted from your resume. **Read each one and adjust the details to match
> what you actually remember** before an interview — especially the *Failure* and *Conflict*
> stories (interviewers probe these; you must be able to defend every specific). The numbers
> come straight from your CV; the Reflections are starting points — make them yours.

How to use the "Big Three":
- **"Tell me about yourself"** → 60–90s narrative: MS CS at Stevens + TA → CareConnect/CodePulse → targeting backend/full-stack.
- **"Most impactful project"** → Story 1 (CareConnect) or Story 2 (CodePulse).
- **"Tell me about a conflict / a failure"** → Story 7 / Story 6.

---

### [Impact / Ownership] CareConnect — the parallel panic-alert system
**Source:** CareConnect (MERN caregiving platform)
**S:** Building CareConnect, a caregiving platform where families coordinate care for a shared patient. A core requirement was a one-tap "panic alert" a caregiver could fire in an emergency — it had to reach every group member instantly and reliably across multiple channels.
**T:** I owned the real-time layer. The alert needed to fan out a Socket.IO message, a persisted notification, and a styled HTML email to every member of the care group — and it couldn't silently drop anyone, because a missed alert in this domain is a real-world safety failure.
**A:** I built the fan-out to dispatch all three channels in parallel rather than sequentially, so one slow email send couldn't delay the others. I wired Socket.IO for the live in-app push, persisted notifications so offline members saw it on next load, and used Nodemailer for the email path. I layered this on top of a 5-role RBAC model with per-membership least-privilege checks so only authorized group members received a given patient's alerts — 40+ endpoints, zero cross-group data leakage.
**R:** The alert reliably reached every group member across all three channels; offline users caught up via the persisted notification. The RBAC enforcement meant no alert ever leaked across care groups.
**Reflection:** Doing the fan-out in parallel mattered more than I first expected — my initial instinct was sequential, which would have coupled the email latency to the in-app push. I learned to identify independent side-effects and parallelize them by default in notification systems.
**Best for questions about:** most impactful project · ownership · real-time systems · designing for reliability · a system you're proud of

---

### [Technical Challenge] CodePulse — 5 parallel workers under a 60-second budget
**Source:** CodePulse (AI repo health analyzer)
**S:** CodePulse analyzes a repository on every push and returns a weighted health score (0–100) covering complexity, vulnerabilities, dead code, coverage, and architectural drift.
**T:** The whole analysis had to feel near-instant — I set a target of streaming a result in under 60 seconds, even though the five analyses are independent and some are slow.
**A:** I ran the five analyses as parallel BullMQ workers per push instead of a sequential pipeline, coordinated them via Redis pub/sub, and fanned the results back to the client with Socket.IO so the score streamed in as pieces completed rather than waiting for all five. For drift detection I used pgvector cosine search over OpenAI embeddings on a multi-tenant Prisma schema, which flagged outliers in under 50ms.
**R:** The weighted health score streamed in under 60 seconds per push, with the five workers running concurrently and results appearing live.
**Reflection:** The hard part wasn't the analyses — it was coordinating five independent workers and streaming partial results without race conditions in the score aggregation. If I rebuilt it I'd add idempotency keys per worker run from the start; I bolted that on later.
**Best for questions about:** hardest technical problem · concurrency · system design · performance optimization · queues/distributed work

---

### [Debugging] Diagnosing async race conditions as a TA
**Source:** Teaching Assistant, CS 546 Web Programming
**T/S:** As TA for the graduate web programming course, I review 80+ submissions a week. A recurring, hard-to-spot class of bug was async race conditions — students' code that passed once and failed intermittently, plus N+1 query patterns and middleware misconfigurations.
**T:** I needed to diagnose these fast and explain them clearly enough that 100+ students actually fixed the underlying misunderstanding, not just the symptom.
**A:** I built an automated grading framework that asserted HTTP responses, JSON contracts, and DB state — which surfaced intermittent failures deterministically instead of relying on a single manual run. For each case I traced the actual execution order (unawaited promises, shared mutable state across requests) and gave the student the specific failing interleaving, not just "you have a race condition."
**R:** I diagnosed 50+ cases of race conditions, middleware misconfigs, and ORM inefficiencies and cut resolution time ~60%; the grading framework cut my turnaround ~80%. Caught concurrency bugs, N+1 patterns, and injection vulns across submissions, reducing the critical defect rate ~30%.
**Reflection:** Teaching the same bug 50 times taught me to recognize the *shape* of a concurrency bug instantly — shared state + an unawaited async call. It made me far more deliberate about `await` and request-scoped state in my own code.
**Best for questions about:** debugging · a hard bug · async/concurrency · teaching/mentoring · attention to detail · testing

---

### [Performance / Trade-off] Cutting API latency 50% at Grownited
**Source:** Software Engineer Intern, Grownited
**S:** At my Grownited internship I worked on RBAC-gated CRM modules. Some dashboard endpoints were slow because they hit MongoDB hard on every request for data that didn't change often.
**T:** Reduce latency on the hot read paths without compromising the role-scoped access controls or serving stale data inappropriately.
**A:** I introduced a Redis caching layer (cache-aside) in front of the expensive reads and rewrote several MongoDB aggregation pipelines that were doing work better pushed into indexed stages. I kept the role-scoped checks in front of the cache so cached data never bypassed authorization.
**R:** Cut API latency ~50% and DB read operations ~40%; the role-scoped controls held — zero privilege-escalation incidents across 15+ secured endpoints.
**Reflection:** The trade-off I had to reason about was cache invalidation vs. staleness — I chose short TTLs for the CRM data because correctness mattered more than squeezing the last bit of hit-rate. I learned to make that staleness call explicitly rather than defaulting to "cache everything."
**Best for questions about:** performance · a trade-off you made · caching · databases · working in a production codebase · internship impact

---

### [Leadership / Collaboration] Mentoring 100+ students and shipping a tool for the TAs
**Source:** Teaching Assistant, CS 546 + canvas-grade-manager (npm)
**S:** Beyond grading, I mentor 100+ graduate students on full-stack development, and the TA team was spending a lot of manual time on Canvas busywork — late-penalty removal, downloading submissions, assembling grading reports.
**T:** Help students level up *and* remove the repetitive overhead slowing the whole TA team down.
**A:** For mentoring, I focused on explaining root causes, not just fixes. For the overhead, I built and published `canvas-grade-manager` to npm — a CLI that automates Canvas late-penalty removal, submission downloads, and grading reports.
**R:** The CLI is used by 6+ TAs and across 150+ students, with ~1,369 weekly downloads. Mentoring + the tooling measurably improved both student outcomes and TA turnaround.
**Reflection:** I almost kept the script as a personal hack. Packaging it for other TAs — handling their edge cases, writing docs — was more work but multiplied the impact. That's when I started thinking about tools as products with users, not just scripts.
**Best for questions about:** leadership · collaboration · mentoring · taking initiative · going above and beyond · communication

---

### [Learning Fast] Building PromptStudio on unfamiliar agent infrastructure
**Source:** PromptStudio (AI code-gen + execution system)
**S:** I wanted PromptStudio to generate runnable Next.js apps from natural language and actually execute the generated code safely — which meant durable job orchestration and isolated sandboxes, neither of which I'd used before (Inngest, E2B).
**T:** Learn an unfamiliar durable-execution model and sandbox platform well enough to build a fault-tolerant pipeline that loses zero jobs on transient failures.
**A:** I designed a 3-agent pipeline with `@inngest/agent-kit` — a 10-iteration routing loop with three Zod-validated tools (terminal, file CRUD, read) — running inside E2B sandboxes provisioned from a custom Dockerfile. I used Inngest durable jobs with step-level checkpointing and automatic retry so a transient failure resumed from the last step instead of restarting. I backed versioned code-fragment history and session replay in Postgres via Prisma.
**R:** The pipeline achieved zero job loss on transient failures and generated runnable apps end-to-end, with session replay so context survived across sessions.
**Reflection:** I ramped by building the smallest possible durable job first and reading the execution traces, rather than reading all the docs up front. Tracing real runs taught me the model faster than the documentation did.
**Best for questions about:** learning something quickly · ambiguity · AI/LLM engineering · fault tolerance · self-direction

---

### [Failure / Mistake] *(draft — adjust to your real memory before using)*
**Source:** CareConnect / CodePulse — pick the one you actually hit
**S:** Early in CareConnect, I shipped the notification logic before fully thinking through what happened when the same recurring task fired reminders — I got duplicate notifications under some timing conditions.
**T:** I had to fix the duplication without dropping legitimate reminders, on logic that was already wired into several cron jobs (recurring task generation, 15-min overdue detection, per-minute reminders).
**A:** I added a dedup step keyed on the task + window so the per-minute reminder couldn't re-fire for an already-notified item, and added a stale-notification cleanup job. I tested the timing edges deliberately instead of assuming the happy path.
**R:** Duplicate reminders stopped while real ones still went out; the cleanup job kept stale state from accumulating.
**Reflection:** My mistake was treating "send a reminder" as stateless when it's really an at-most-once-per-window guarantee. I now ask "what's the delivery guarantee?" before writing any notification or job-scheduling code.
**Best for questions about:** a time you failed · a mistake · what you'd do differently · handling your own bug
**⚠️ Make this yours:** swap in the real misstep you remember if this isn't quite it — interviewers will dig into the specifics.

---

### [Conflict / Disagreement] *(draft — adjust to your real memory before using)*
**Source:** A technical trade-off decision (TA context or a project design call)
**S:** *(Best version: a real disagreement you had — with a teammate, a professor, or yourself on a design call. Example scaffold below; replace with your actual one.)* While building CodePulse I had to decide between a simpler sequential analysis and the more complex 5-worker parallel design; there was a real pull toward shipping the simple version first.
**T:** Decide whether the added complexity (queues, pub/sub coordination, partial-result streaming) was worth it for the sub-60-second goal, and be able to justify the call.
**A:** I weighed it explicitly: the sequential version was faster to build but couldn't hit the latency target as the analyses grew. I prototyped the parallel path far enough to confirm the coordination was tractable with BullMQ + Redis pub/sub, then committed to it — but kept each worker independently testable so the complexity stayed contained.
**R:** The parallel design hit the latency goal and the per-worker isolation kept it debuggable.
**Reflection:** I learned to disagree with my own "just ship the simple thing" instinct by tying the decision to a concrete requirement (the latency budget) rather than taste.
**Best for questions about:** disagreement · a tough technical decision · pushing back · defending a design
**⚠️ Make this yours:** if you have a real interpersonal disagreement (a TA grading-policy call, a group project), that's a stronger answer than a solo trade-off — use it.
