# Notion — Full Interview Q&A (STAR+R)

Every likely question with a scripted answer grounded in your real projects.
Read each one aloud 2-3 times before the interview. Adjust details to match
what you actually remember — interviewers will probe specifics.

---

## Part 1: The Openers

---

### Q1. Tell me about yourself (60-90 seconds)

> I'm Harshil — I'm finishing my MS in Computer Science at Stevens Institute of Technology with a 3.86 GPA, graduating May 2026.
>
> Before grad school I interned at Grownited as a software engineer, where I built RBAC-gated CRM modules and cut API latency by 50% with Redis caching and MongoDB pipeline optimizations.
>
> At Stevens I've been a TA for the graduate web programming course, mentoring 100+ students. I diagnosed 50+ async race conditions across student submissions and published an npm CLI — canvas-grade-manager — that automates Canvas grading workflows and gets about 1,400 weekly downloads.
>
> On the project side, I've built three full-stack systems end-to-end. CareConnect is a real-time caregiving platform with Socket.IO group chat and a parallel panic-alert fan-out. CodePulse is an AI-powered repo health analyzer that runs 5 parallel BullMQ workers and streams a health score in under 60 seconds. And PromptStudio generates runnable Next.js apps from natural language using a 3-agent pipeline with durable jobs and sandboxed execution.
>
> I'm targeting backend and full-stack new-grad roles, and Notion is at the top of my list — I'm drawn to the block-model architecture and the scale challenges I've read about in your engineering blog, like the PostgreSQL re-sharding work. My background in real-time systems, multi-tenant data isolation, and AI integration maps well to the problems you're solving.

---

### Q2. Why Notion?

> Three reasons — product, architecture, and culture.
>
> **Product:** I've been a daily Notion user throughout grad school — I use it for coursework, project planning, and even my job search pipeline. I've built real workflows with databases, relations, and rollups, so I understand the product as a power user, not just casually.
>
> **Architecture:** What excites me technically is the block model — the idea that a single composable primitive (a block) can represent a paragraph, a database row, an image, or an entire page. That's an elegant abstraction, and the engineering challenges that come with it are fascinating. I read your blog posts on sharding PostgreSQL from 32 to 480 instances and the WASM SQLite work for offline mode — those are exactly the kinds of scaling problems I want to work on.
>
> **Culture:** Notion's emphasis on craftsmanship resonates with how I build. When I wrote canvas-grade-manager, I could have kept it as a personal script, but I packaged it properly with docs and published it to npm because I think tools should be products, not hacks. That "build it right" mentality is what I see in Notion's engineering culture.
>
> My experience with real-time systems in CareConnect, multi-tenant PostgreSQL schemas in CodePulse, and AI integrations in PromptStudio maps directly to the collaborative editing, workspace-level data isolation, and AI workflow challenges Notion is tackling.

---

### Q3. Why should we hire you?

> I bring three things that are hard to find in one new-grad candidate.
>
> First, I've built complete, production-grade systems end-to-end — not toy apps. CareConnect has 5-role RBAC on 40+ endpoints with zero cross-group data leakage, real-time Socket.IO chat, and four cron jobs handling recurring tasks. CodePulse coordinates 5 parallel workers via Redis pub/sub and streams results via Socket.IO. These aren't class projects — they're systems with real architectural decisions behind them.
>
> Second, I have direct experience with the patterns that matter at Notion: multi-tenant data isolation, PostgreSQL with Prisma, real-time WebSocket communication, caching layers, and AI/LLM integrations. I've worked with the Node.js/TypeScript stack you still use in parts of your backend.
>
> Third, I build tools for other people, not just for myself. Publishing canvas-grade-manager to npm, mentoring 100+ students as a TA, explaining root causes instead of just fixes — that's how I think about craft. I care about code that other engineers can read, maintain, and extend.

---

## Part 2: Behavioral — STAR+R Format

---

### Q4. Tell me about your most impactful project.

**Use: CareConnect — parallel panic-alert system**

**S:** I built CareConnect, a caregiving platform where families coordinate care for a shared patient. One of the core requirements was a panic alert — a one-tap button a caregiver could fire in an emergency that had to reach every group member instantly and reliably.

**T:** I owned the entire real-time notification layer. The alert needed to fan out across three channels simultaneously — a Socket.IO push for anyone online, a persisted notification for offline members, and a styled HTML email — and it couldn't silently drop anyone. In caregiving, a missed alert is a real-world safety failure.

**A:** My first instinct was to send these sequentially — Socket.IO first, then persist, then email. But I realized a slow email send would delay the in-app push, which defeats the purpose. So I restructured the fan-out to dispatch all three channels in parallel. I used Socket.IO for the live push, persisted notifications to MongoDB so offline members would see them on next load, and Nodemailer for the email path. I layered all of this on top of a 5-role RBAC model with per-membership least-privilege checks — every request goes through authorization before it touches any data. 40+ endpoints, and the RBAC ensures a patient's alert never leaks to members of a different care group.

**R:** The alert reached every group member across all three channels reliably. Offline users caught up via the persisted notifications. Zero cross-group data leakage throughout the system.

**Reflection:** The parallel fan-out was the right call but I almost didn't make it — sequential felt simpler. I learned to ask "are these side-effects independent?" and parallelize by default when they are. That pattern showed up again in CodePulse where I parallelized 5 analysis workers.

**Notion tie-in:** *"This maps to how Notion handles real-time collaboration — multiple users editing simultaneously is conceptually similar to multiple notification channels that need to stay in sync without blocking each other."*

---

### Q5. What's the hardest technical problem you've solved?

**Use: CodePulse — 5 parallel workers under 60-second budget**

**S:** CodePulse analyzes repositories on every push and produces a weighted health score covering complexity, vulnerabilities, dead code, coverage, and architectural drift — five independent analyses, some of which are slow.

**T:** I set a target: the full score had to stream to the user in under 60 seconds. The challenge was that running five analyses sequentially would blow past that budget, but running them in parallel introduced coordination complexity — partial results, race conditions in score aggregation, and failure handling.

**A:** I set up each analysis as an independent BullMQ worker. On every push, five jobs get enqueued and execute concurrently. I used Redis pub/sub to coordinate — each worker publishes its partial result when done, and a listener aggregates them. I streamed partial results to the client via Socket.IO, so the user sees scores appear as each worker finishes rather than waiting for all five. For the drift detection specifically, I used pgvector cosine search over OpenAI embeddings on a multi-tenant Prisma schema, which flagged architectural outliers in under 50ms.

**R:** The weighted health score streams in under 60 seconds per push. Workers run concurrently and results appear live as they complete.

**Reflection:** The hard part wasn't writing any single analysis — it was the coordination. I had a race condition early on where two workers could both try to finalize the aggregate score simultaneously. I fixed it but learned I should have designed in idempotency keys per worker run from the start instead of bolting them on later. Now "what's the concurrency model?" is one of the first questions I ask when designing any multi-worker system.

**Notion tie-in:** *"This is analogous to how Notion might process multiple block operations in parallel — multiple users editing different blocks simultaneously, with results streaming back in real time without race conditions."*

---

### Q6. Tell me about a hard bug you debugged.

**Use: TA — async race conditions**

**S:** As TA for the graduate web programming course at Stevens, I review 80+ student submissions a week. A recurring class of bug was async race conditions — code that passed on one run but failed intermittently. Students would submit Express apps where unawaited promises or shared mutable state across requests caused silent data corruption.

**T:** I needed to diagnose these efficiently — not just spot them but explain the root cause clearly enough that 100+ students actually understood the underlying misunderstanding, not just the symptom.

**A:** I built an automated grading framework that asserts HTTP responses, JSON contracts, and database state deterministically — no more "it worked when I ran it manually." This framework surfaced intermittent failures that a single manual run would miss. For each case, I traced the actual execution order — identified the unawaited promise, the shared mutable state, or the missing middleware — and gave the student the specific failing interleaving, not a generic "you have a race condition."

**R:** I diagnosed 50+ cases of race conditions, middleware misconfigs, and ORM inefficiencies. Resolution time dropped by about 60%. The grading framework cut my own turnaround by 80%, and the critical defect rate across submissions dropped roughly 30%.

**Reflection:** Teaching the same bug 50 times taught me to recognize the *shape* of a concurrency bug instantly: shared state + an unawaited async call. It made me much more deliberate about `await` and request-scoped state in my own code. I now treat shared mutable state in concurrent paths as a code smell that needs explicit justification.

**Notion tie-in:** *"At Notion's scale with hundreds of engineers, this kind of pattern recognition — spotting the shape of a bug class rather than debugging each instance individually — is exactly what keeps codebases healthy. And the tooling approach mirrors how I'd think about developer productivity infrastructure."*

---

### Q7. Tell me about a trade-off you made.

**Use: Grownited — caching vs. correctness**

**S:** During my internship at Grownited, I worked on RBAC-gated CRM modules. Some dashboard endpoints were slow — they hit MongoDB hard on every request for data that didn't change frequently, like aggregated reports and user lists.

**T:** Reduce latency on the hot read paths without compromising the role-scoped access controls or serving stale data that could lead to incorrect business decisions.

**A:** I introduced a Redis caching layer using the cache-aside pattern — check cache first, fall back to DB on miss, populate cache on read. The key trade-off was cache invalidation strategy. I had two options: long TTLs for maximum cache hit rate, or short TTLs to bound staleness. For CRM data — where a manager might be looking at a report while a team member updates a deal — I chose short TTLs because correctness mattered more than squeezing the last few percent of hit rate. I also rewrote several MongoDB aggregation pipelines, pushing filtering into indexed stages instead of doing it in-memory. Critically, I kept the role-scoped authorization checks *in front of* the cache — cached data never bypasses access controls.

**R:** API latency dropped about 50%, DB read operations dropped about 40%. Zero privilege-escalation incidents across 15+ secured endpoints.

**Reflection:** The staleness vs. performance trade-off isn't one-size-fits-all. For this CRM data, short TTLs were right because a manager acting on stale numbers is worse than a slightly slower page load. I learned to make the staleness guarantee explicit — "this data can be up to N seconds old" — rather than defaulting to "just cache everything."

**Notion tie-in:** *"Notion faces this trade-off at massive scale — caching block data for performance while ensuring real-time collaboration shows the latest state. The same principle applies: you need to reason about the staleness guarantee explicitly, not just slap a cache in front of everything."*

---

### Q8. Tell me about a time you showed leadership or helped others.

**Use: Mentoring 100+ students + canvas-grade-manager**

**S:** As TA for CS 546 at Stevens, I mentor 100+ graduate students on full-stack development. Beyond teaching, I noticed the TA team was spending hours every week on Canvas busywork — manually removing late penalties, downloading submissions one by one, assembling grading reports.

**T:** Two goals: help students level up by teaching root causes (not just "here's the fix"), and eliminate the repetitive overhead slowing down the entire TA team.

**A:** For mentoring, I changed my approach from just pointing out bugs to explaining *why* the bug exists — tracing an unawaited promise through the execution model, explaining why an N+1 query pattern hits the DB 100 times instead of once. For the TA overhead, I built canvas-grade-manager — a CLI tool that automates late-penalty removal, submission downloads, and grading report generation via the Canvas API. I published it to npm with proper documentation so any TA could use it, not just me.

**R:** The CLI is used by 6+ TAs across 150+ students, with about 1,369 weekly downloads on npm. Students started debugging their own async issues after I taught them the pattern. The grading turnaround improved measurably for the whole TA team.

**Reflection:** I almost kept canvas-grade-manager as a personal script. Packaging it properly — handling other TAs' edge cases, writing docs, publishing to npm — was significantly more work. But it multiplied the impact from "saves me time" to "saves the whole team time." That's when I started thinking about every tool I build as a product with users, not just a script for myself.

**Notion tie-in:** *"This is essentially what Notion does — take something that could be a personal hack (a doc, a spreadsheet, a wiki) and build it into a composable tool that works for entire teams. Building canvas-grade-manager taught me that mindset: think about your users, not just your own workflow."*

---

### Q9. Tell me about a time you learned something quickly.

**Use: PromptStudio — Inngest + E2B**

**S:** I wanted PromptStudio to generate runnable Next.js apps from natural language and actually execute the generated code safely. That required two technologies I'd never used: Inngest for durable job orchestration and E2B for sandboxed code execution.

**T:** I needed to learn both well enough to build a fault-tolerant pipeline — one that loses zero jobs on transient failures and executes untrusted generated code safely. I couldn't afford a long ramp-up period because I was building this alongside coursework.

**A:** Instead of reading all the docs front-to-back, I built the smallest possible durable job first — a simple function that just logged a message through Inngest's step API. I watched the execution traces in Inngest's dashboard, which taught me the retry and checkpointing model faster than any documentation. I did the same with E2B — started with a minimal sandbox that ran one shell command, then layered on the custom Dockerfile, file I/O, and the agent loop. I designed a 3-agent pipeline using @inngest/agent-kit with a 10-iteration routing loop and 3 Zod-validated tools, running inside E2B sandboxes provisioned from a custom Dockerfile. I used Inngest's step-level checkpointing so a transient failure would resume from the last completed step instead of restarting.

**R:** The pipeline achieved zero job loss on transient failures. It generates runnable Next.js apps end-to-end from a natural language prompt, with session replay so context survives across sessions.

**Reflection:** The key was learning by tracing real execution, not by reading exhaustively. Watching how Inngest retried a failed step and how E2B provisioned a sandbox taught me the mental model in hours, not days. I now default to "build the smallest working thing, then instrument and observe" as my learning strategy for any unfamiliar system.

**Notion tie-in:** *"At Notion, I'd be working with technologies I haven't used before — Kotlin, Kafka, your block-model internals. My learning approach is the same: build the smallest thing, trace the execution, iterate. I've proven I can ramp quickly without hand-holding."*

---

### Q10. Tell me about a time you failed or made a mistake.

**Use: CareConnect — duplicate notifications**

**S:** Early in CareConnect, I shipped the notification system for recurring care tasks — things like "give medication at 8 AM" that repeat daily. The system had four cron jobs: recurring task generation, 15-minute overdue detection, per-minute reminders, and stale notification cleanup.

**T:** After deploying, I discovered that under certain timing conditions, the same recurring task could fire duplicate reminders. The per-minute reminder cron would run while the task was still within its reminder window, and since I hadn't added any deduplication, the same caregiver would get notified multiple times for the same task.

**A:** My mistake was treating "send a reminder" as a stateless operation — fire and forget. But it's actually an at-most-once-per-window guarantee. I added a deduplication step keyed on [task_id + reminder_window] so the per-minute reminder couldn't re-fire for a task that had already been notified in that window. I also added a stale-notification cleanup job to prevent old state from accumulating. Then I wrote tests that deliberately hit the timing edge cases — two cron runs overlapping, a task transitioning from "due" to "overdue" mid-window — instead of only testing the happy path.

**R:** Duplicate reminders stopped completely while legitimate reminders kept flowing. The cleanup job prevented stale notifications from piling up.

**Reflection:** The root cause was that I jumped to implementation without asking "what's the delivery guarantee?" For reminders it's at-most-once-per-window, not fire-every-time-the-cron-runs. Now, before I write any notification or scheduling code, the first question I ask is "what's the delivery guarantee?" — at-most-once, at-least-once, or exactly-once — because the implementation pattern is completely different for each.

**Notion tie-in:** *"This is directly relevant to Notion — notifications for @mentions, reminders, comments all need clear delivery guarantees. At Notion's scale with millions of users, a duplicate notification bug wouldn't just be annoying, it could generate massive load. Getting the guarantee right up front matters."*

---

### Q11. Tell me about a disagreement or conflict.

**Use: CodePulse — sequential vs. parallel design**

**S:** When building CodePulse, I faced an internal design decision that had real tension: should I run the five code analyses sequentially (simpler, faster to build) or in parallel with BullMQ workers (complex, but faster for the user)?

**T:** The sequential approach was tempting — each analysis runs one after another, results come back in order, no coordination needed. But my latency target was under 60 seconds for all five analyses, and the sequential path couldn't hit that as analyses grew in scope. I needed to decide whether the added complexity of queues, Redis pub/sub coordination, and partial-result streaming was justified.

**A:** Instead of going with my gut, I tied the decision to a concrete requirement: the 60-second latency budget. I estimated that the slowest analysis (architectural drift with pgvector embedding lookups) alone could take 20-30 seconds. Sequentially, five analyses would blow past 60 seconds easily. So I prototyped the parallel path far enough to confirm the coordination was tractable — BullMQ for job dispatch, Redis pub/sub for completion events, Socket.IO for streaming partial results. I kept each worker independently testable so the complexity stayed contained — any worker can run in isolation without the others.

**R:** The parallel design hit the 60-second target. Each worker runs independently and results stream to the user as they complete, which is actually a better UX than waiting for all five. The per-worker isolation meant debugging was no harder than the sequential version.

**Reflection:** I learned to disagree with my own "just ship the simple thing" instinct by anchoring the decision to a measurable requirement. "Simple" isn't always right — sometimes the complex approach is the correct one, and you can tell by testing it against the spec, not your comfort level.

**Notion tie-in:** *"Notion's engineers probably face this trade-off constantly — a block editor that feels instant requires parallel processing under the hood, not sequential. The principle of anchoring design decisions to user-facing latency targets rather than implementation comfort is something I'd bring to the team."*

---

### Q12. Tell me about a time you went above and beyond.

**Use: canvas-grade-manager — from personal script to npm package**

**S:** While TAing CS 546, I wrote a Node.js script to automate some Canvas busywork I was doing every week — downloading student submissions, removing late penalties, generating grading reports. It started as a quick personal hack.

**T:** It worked great for me, but I realized every TA on the team was doing the same manual work. I could have just shared the script, but that would mean everyone maintaining their own copy, dealing with setup issues, and not getting updates.

**A:** I decided to turn it into a proper npm package. That meant: abstracting my hardcoded values into configuration, adding proper CLI argument parsing, handling edge cases other TAs would hit (different course structures, different penalty rules), writing documentation, setting up the npm publishing workflow, and maintaining it as a real open-source tool. It was significantly more work than just emailing a .js file.

**R:** canvas-grade-manager is now used by 6+ TAs across 150+ students, with roughly 1,369 weekly downloads on npm. It's a real tool that survives across semesters, not a one-off script.

**Reflection:** The difference between "this works for me" and "this works for anyone" is bigger than it looks — maybe 3x the effort. But the impact multiplied even more. This taught me to think about tools as products: who are the users, what are their edge cases, how do they discover and install this? That product-thinking lens stuck with me.

**Notion tie-in:** *"Notion's entire product philosophy is about taking personal workflows and making them collaborative. Building canvas-grade-manager was a small version of that same instinct — I took a personal script and turned it into a tool for a team."*

---

### Q13. How do you handle ambiguity?

**Use: PromptStudio — designing the agent pipeline from scratch**

**S:** When I started PromptStudio, there was no established pattern for "take a natural language prompt, generate a full Next.js app, and execute it safely." I was combining three unfamiliar technologies — Inngest for durable execution, E2B for sandboxing, and @inngest/agent-kit for multi-agent orchestration — and none of them had examples that matched what I was building.

**T:** I needed to design a working pipeline without a clear blueprint. The ambiguity was in every dimension: how many agents, what tools each agent gets, how to handle failures, how to know when the generation is "done," and how to persist context across sessions.

**A:** I broke the ambiguity into testable pieces. First question: can Inngest reliably retry a failed step? I built a trivial durable job and watched it retry. Second: can E2B run arbitrary terminal commands safely? I provisioned a sandbox and ran a shell command. Once both worked, I designed the 3-agent pipeline with a 10-iteration routing loop and 3 Zod-validated tools. For "how to know when it's done," I used auto-termination on task-summary extraction — when the agent produces a summary, the loop exits. For persistence, I stored versioned code fragments and session replay in PostgreSQL via Prisma.

**R:** The pipeline works end-to-end: natural language in, runnable Next.js app out, zero job loss on transient failures, and context that survives across sessions.

**Reflection:** The key to handling ambiguity is not to try to solve the whole problem at once. Break it into questions you can answer with a small experiment, validate each one, then compose them. The worst approach would have been to design the whole pipeline on paper and try to build it all at once.

---

### Q14. What's a project you're most proud of and why?

**Use: CareConnect (full system)**

**S:** CareConnect is a full-stack caregiving platform I architected end-to-end. Families use it to coordinate care for a shared patient — scheduling tasks, tracking medications, chatting in real time, and sending panic alerts.

**T:** I wanted to build something that wasn't just a CRUD app — something with real architectural challenges: multi-role access control, real-time communication, background job processing, and data isolation across care groups.

**A:** I designed a 5-role RBAC system with per-membership least-privilege checks on every operation — 40+ endpoints, zero cross-group data leakage. I built real-time Socket.IO group chat with message edit history, read receipts, and admin-only delete. I implemented the parallel panic-alert fan-out across Socket.IO, persisted notifications, and email. I built atomic medication dose tracking with supply-count decrement and recursive user deletion with ownership transfer. I wired four cron jobs for recurring task management with deduplication. The whole thing runs as a four-service Docker Compose stack deployed on AWS EC2.

**R:** It's a production-ready system with dual-path auth (JWT with Firebase Admin SDK fallback), Redis caching for 50% DB query reduction, and S3 pre-signed URLs for documents. Every feature has real engineering depth behind it — not just "it works" but "it works correctly under concurrent access with proper authorization."

**Reflection:** What I'm most proud of isn't any single feature — it's that the whole system holds together. Every endpoint is authorized, every concurrent operation is safe, every background job handles edge cases. That level of thoroughness is what I think of as craftsmanship.

**Notion tie-in:** *"CareConnect's challenge of multiple roles collaborating on shared data with real-time sync and strict access controls is structurally similar to Notion workspaces — multiple users with different permission levels editing shared pages in real time."*

---

## Part 3: Product Sense (Notion-Specific)

---

### Q15. If you could add one feature to Notion, what would it be?

> I'd add **real-time presence indicators at the block level** — not just "Sarah is viewing this page" but "Sarah is currently editing this paragraph." When you're collaborating on a long document, knowing exactly which block someone is working on helps you avoid merge conflicts before they happen and makes the collaboration feel more immediate.
>
> From an implementation perspective, it maps well to the block model — each block already has a unique ID, so you'd broadcast cursor/selection events keyed by block ID over WebSocket. The trade-off is update frequency vs. network load: you'd want to debounce cursor position updates (maybe every 200-300ms) and only broadcast to users who are viewing the same page. You could batch presence updates into a single WebSocket frame to reduce overhead.
>
> The UX win is that it transforms collaboration from "we're both on this page" to "I can see exactly where you're working," which is more like sitting next to someone than using a shared doc.

---

### Q16. What would you improve about Notion's performance?

> The two performance pain points I notice as a user are **initial page load time** for large databases and **search latency** across a workspace with lots of pages.
>
> For large databases, I'd look at virtual scrolling — only rendering the rows visible in the viewport instead of the full dataset. Notion already does some of this, but on databases with 1000+ rows and many properties, it still feels sluggish. On the backend, I'd consider lazy-loading block children: fetch the first N rows immediately and paginate the rest as the user scrolls.
>
> For search, I know Notion uses Elasticsearch. One improvement would be **client-side search caching** — after the first workspace-wide search, cache the index locally (this ties into the WASM SQLite work Notion has done) so subsequent searches can hit the local cache first and only fall back to the server for new content. You'd need a sync mechanism to keep the local index fresh, but for most searches ("find the doc I edited yesterday"), slightly stale results are acceptable.
>
> I'd measure impact with Core Web Vitals: LCP for page load, and time-to-first-result for search.

---

### Q17. How would you design a block-based document editor? (System Design Lite)

> **Data model:** Every piece of content is a block. Schema:
> ```
> blocks (
>   id          UUID PRIMARY KEY,
>   workspace_id UUID,        -- shard key
>   page_id     UUID,
>   parent_id   UUID NULL,    -- NULL = top-level block
>   type        TEXT,          -- paragraph, heading, image, database, etc.
>   content     JSONB,         -- type-specific payload
>   position    FLOAT,         -- for ordering among siblings
>   created_by  UUID,
>   updated_at  TIMESTAMP
> )
> ```
>
> **Why FLOAT for position:** Inserting between two blocks (position 1.0 and 2.0) is just 1.5 — no need to renumber all siblings. Notion's blog confirms they use a similar approach.
>
> **Real-time collaboration:** WebSocket connection per open page. When a user edits a block, the client sends an operation (OT-style) to the server. The server applies it, persists it, and broadcasts to all other connected clients. Conflict resolution: last-writer-wins for simple content changes, OT for concurrent text edits within the same block.
>
> **API design:**
> - `GET /pages/:id/blocks` — returns the block tree
> - `PATCH /blocks/:id` — update a block's content
> - `POST /blocks` — create a new block (specify parent_id, position)
> - `DELETE /blocks/:id` — soft-delete (cascade to children)
> - `POST /blocks/:id/move` — change parent or position
>
> **Scaling:** Shard by workspace_id so all of a workspace's data lives on the same shard. This keeps page loads to a single shard query. Use Redis for caching hot blocks and WebSocket connection state.

---

## Part 4: Technical Deep-Dive Questions

---

### Q18. Walk me through the architecture of one of your projects.

**Use: CodePulse**

> CodePulse is a full-stack code analysis platform. Here's the architecture:
>
> **Trigger:** A GitHub webhook fires on every push. The webhook is verified with HMAC-SHA256 to prevent spoofing. The payload tells us which repo and commit to analyze.
>
> **Job dispatch:** The webhook handler enqueues 5 independent BullMQ jobs — one per analysis dimension (complexity, vulnerabilities, dead code, coverage, architectural drift). BullMQ is backed by Redis.
>
> **Workers:** Each of the 5 workers runs its analysis independently. The drift detector is the most interesting — it generates OpenAI embeddings for code files and uses pgvector cosine similarity search on a multi-tenant Prisma/PostgreSQL schema to find architectural outliers in under 50ms.
>
> **Coordination:** When a worker finishes, it publishes its partial result to a Redis pub/sub channel. A listener aggregates partial results and computes the weighted health score. Socket.IO streams each partial result to the client as it arrives — so the user sees the score building up in real time, not waiting for all five.
>
> **AI layer:** On top of the analysis, there's an agentic AI chat — GPT-4o-mini with 6 tool-calling functions for RAG over the analysis results. A root cause investigator, a multi-agent refactor debate, and a codebase tour — all streamed via SSE under 400ms. This layer is also exposed via MCP so third-party IDEs can consume it.
>
> **Frontend:** Next.js with Clerk auth, TanStack Query for live polling, Recharts and D3 for visualization. Stripe billing with webhook-verified checkout for Free/Pro/Team tiers.

---

### Q19. How would you handle data consistency in a multi-tenant system?

> From my CodePulse experience, here's how I approach multi-tenancy:
>
> **Schema-level isolation:** Every table includes a `workspace_id` (or equivalent tenant identifier). In CodePulse, this is enforced at the Prisma schema level — every query is scoped by the tenant, and the ORM doesn't allow cross-tenant queries by design.
>
> **Authorization before data access:** In CareConnect, I implemented role-scoped checks *before* any data access — not after. The middleware validates JWT, extracts the user's role and group membership, and rejects the request before it ever hits the database if the user doesn't have permission. Cached data also goes through this check — the cache never bypasses authorization.
>
> **Foreign key constraints:** Where possible, I use database-level foreign keys so the DB itself prevents orphaned or mislinked records across tenants.
>
> **At Notion's scale** (480 PostgreSQL shards), the key is that sharding by workspace_id means all of a workspace's data co-locates on the same shard. This eliminates cross-shard queries for the most common operations (loading a page, searching within a workspace). The trade-off is that cross-workspace operations (like sharing a page to another workspace) require cross-shard coordination.

---

### Q20. Explain a caching strategy you've implemented and its trade-offs.

> At Grownited, I implemented cache-aside with Redis in front of MongoDB for RBAC-gated CRM endpoints.
>
> **How it works:** On read, check Redis first. On miss, query MongoDB, populate Redis with a TTL, return the result. On write, invalidate the cache entry.
>
> **Trade-off 1 — TTL length:** Short TTLs (60s) mean lower hit rate but bounded staleness. Long TTLs (5min+) mean higher hit rate but risk serving stale data. For CRM data where managers make decisions based on dashboards, I chose short TTLs — correctness over performance.
>
> **Trade-off 2 — Invalidation strategy:** I used TTL-based expiration rather than explicit invalidation-on-write because the CRM had many write paths and I couldn't guarantee all of them would correctly invalidate the cache. TTL is a safety net — worst case, data is stale for 60 seconds.
>
> **Trade-off 3 — Authorization layer placement:** I put role-scoped checks *in front of* the cache, not after. This means a cache hit still goes through authorization. Slightly slower than caching the authorized result, but much safer — you never risk serving cached data from a role that's been revoked.
>
> **Result:** 50% latency reduction, 40% DB read reduction, zero privilege escalation incidents.

---

## Part 5: Culture / Craft Questions

---

### Q21. What does "craftsmanship" mean to you in software?

> To me, craftsmanship is the difference between "it works" and "it works correctly under all conditions, is readable by the next person, and handles edge cases gracefully."
>
> A concrete example: when I built the notification system in CareConnect, "it works" would have been sending a reminder every time the cron fires. Craftsmanship was asking "what's the delivery guarantee?" — realizing it needs to be at-most-once-per-window, adding deduplication keyed on task + window, and writing tests for the timing edge cases.
>
> Another example: I could have kept canvas-grade-manager as a personal script. Craftsmanship was packaging it as a proper npm package with docs, handling other TAs' edge cases, and publishing it so it works for anyone — not just me.
>
> In code, craftsmanship shows up as: clear naming, explicit error handling, authorization checks that can't be bypassed, and tests that cover the edge cases — not just the happy path.

---

### Q22. How do you approach code quality?

> Three principles I follow:
>
> **1. Authorization is non-negotiable.** In CareConnect, every one of 40+ endpoints goes through RBAC middleware before touching data. In Grownited, cached data still passes through role checks. I've never had a privilege-escalation incident because I treat authorization as a hard requirement, not a nice-to-have.
>
> **2. Test the edges, not just the happy path.** My CareConnect notification dedup bug happened because I only tested the happy path initially. Now I deliberately test concurrent timing, boundary conditions, and failure modes. My TA grading framework does the same — it surfaces intermittent async failures that a single manual run would miss.
>
> **3. Build for the reader.** When I write code, I think about the engineer who'll read it in 6 months. That means clear function names, explicit data flow (no hidden side effects), and separating concerns so each module can be understood independently. In CodePulse, each BullMQ worker is independently testable — you can run the vulnerability scanner without touching the drift detector.

---

### Q23. Describe your ideal engineering team culture.

> I thrive in an environment with three qualities:
>
> **Ownership:** I want to own features end-to-end — from design to deploy to monitoring. In my projects I've done exactly that, and I find it more motivating than being handed a spec. Notion's small-team structure where engineers own entire features is exactly this.
>
> **Honest feedback:** My TA experience taught me the value of explaining *why* something is wrong, not just that it's wrong. I want teammates who review my code thoughtfully and push back when they see a better approach.
>
> **Product-mindedness:** I care about whether the thing I'm building actually helps users, not just whether it passes tests. Building canvas-grade-manager taught me to think about users — "will this work for TAs at other schools?" — and I want to be on a team where engineers think about the user experience, not just the implementation.
>
> Notion's culture of craftsmanship and small empowered teams is exactly what I'm looking for.

---

## Part 6: Situational / Hypothetical

---

### Q24. You're given a feature that's vaguely defined. How do you proceed?

> I break the ambiguity into questions I can answer with small experiments. That's what I did with PromptStudio — I didn't know how Inngest durable jobs worked, so I built the smallest possible one and traced the execution. Once I understood the primitives, I could design the full pipeline.
>
> Concretely, my approach is:
> 1. **Clarify the user problem.** What are we solving and for whom? What does success look like?
> 2. **Identify the riskiest technical unknown.** Build a prototype for that one piece first — not the whole feature.
> 3. **Propose a scope.** Here's what I think V1 looks like, here's what's deferred. Get alignment before building.
> 4. **Ship incrementally.** Don't wait until everything is done to get feedback.

---

### Q25. How would you onboard to a large, unfamiliar codebase?

> My approach:
> 1. **Run it first.** Get the app running locally, click through the features, understand the user experience before reading code.
> 2. **Trace one request.** Pick one user action (e.g., "create a new page") and trace it end-to-end: from the frontend event, through the API layer, to the database. That gives me the full stack shape.
> 3. **Read the data model.** Database schemas tell you what the system *actually* does, not what the docs say it does.
> 4. **Take a small ticket.** Pick a well-scoped bug or minor feature that touches a few files. The PR review process teaches me team conventions faster than any doc.
> 5. **Ask targeted questions.** Not "how does this work?" but "I traced this request to here and expected X but saw Y — am I misunderstanding the auth middleware?"
>
> At Notion, I'd start by understanding the block model — trace what happens when a user types a paragraph, creates a database, or moves a block. That one path would teach me the frontend → API → Postgres → WebSocket flow.

---

## Quick Reference Card

| Question type | Lead with | Project | Key number |
|---------------|-----------|---------|------------|
| Impact / ownership | Panic alert parallel fan-out | CareConnect | 40+ endpoints, 0 data leakage |
| Technical challenge | 5 workers under 60s budget | CodePulse | <60s, 5 concurrent workers |
| Debugging | Async race condition diagnosis | TA role | 50+ bugs, 60% faster resolution |
| Trade-off | Cache TTL vs. correctness | Grownited | 50% latency cut, 0 privilege escalation |
| Leadership | npm package for TA team | TA + npm | 1,369 weekly downloads, 6+ TAs |
| Learning fast | Inngest + E2B ramp-up | PromptStudio | Zero job loss, unfamiliar tech |
| Failure | Duplicate notification bug | CareConnect | At-most-once-per-window fix |
| Conflict | Sequential vs. parallel design | CodePulse | Anchored to 60s latency target |
| Product sense | Block-level presence indicators | — | — |
| Craftsmanship | "It works" vs. "it works correctly" | All projects | — |

---

*Generated 2026-06-13. Pair with `interview-prep/notion.md` for tech stack, DSA problems, and logistics.*
