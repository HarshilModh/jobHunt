# Interview Prep — Notion

**Target roles:**
- [Software Engineer, New Grad](https://jobs.ashbyhq.com/notion/a6311f97-4850-4674-a5f3-d9fe5f6f2555)
- [Software Engineer, New Grad (AI)](https://jobs.ashbyhq.com/notion/7e6dc7fe-7ddd-42c1-8928-13f7bddb9ec9)

**Other Notion openings in pipeline:**
- [Software Engineer, Product Infrastructure](https://jobs.ashbyhq.com/notion/d41b635b-c17b-4efd-89fd-fdb2ddb62e9a)
- [Software Engineer, AI Workflows](https://jobs.ashbyhq.com/notion/17330e14-83db-49a4-ae31-411690d97dba)
- [Software Engineer, AI Capture](https://jobs.ashbyhq.com/notion/b31ce253-4238-4ed6-a5a2-73b63cbf1709)
- [Software Engineer, Collections Experience](https://jobs.ashbyhq.com/notion/5d8c1ec6-e9ea-416b-9715-880bf5037abc)
- [Software Engineer, Trust](https://jobs.ashbyhq.com/notion/66236b7e-2905-4a93-84a5-ed036a1a6581)
- [Software Engineer, Web Infrastructure](https://jobs.ashbyhq.com/notion/6895adad-5031-4dce-9e8e-b9361d3a2850)
- [Software Engineer, Security](https://jobs.ashbyhq.com/notion/def3f337-5593-491c-b34d-e0b53f2a5cac)

**Tier:** 1 (dream company) | **Sponsors:** Yes | **Location:** SF (NYC presence)

---

## 1. Notion's Tech Stack (know this cold)

| Layer | Tech |
|-------|------|
| Frontend | React, TypeScript, Electron (desktop), WebView (mobile) |
| Backend | **Kotlin/JVM** (migrated from Node.js), some remaining Node.js services |
| Database | **PostgreSQL** — 480 shards, application-level sharding by workspace ID |
| Caching | Redis, Memcached |
| Search | Elasticsearch |
| Streaming | Apache Kafka |
| Infra | AWS (EC2, RDS, S3, CloudFront), Kubernetes, Terraform |
| Monitoring | Datadog |
| Offline | SQLite compiled to WASM via Rust |
| Collab editing | OT/CRDT-based real-time sync |

**Key architecture concept:** Everything in Notion is a **block**. Pages, paragraphs, images, database rows — all stored as blocks in PostgreSQL with a uniform schema. This block-based data model is central to their system.

**Must-read blog posts:**
- "Sharding Postgres at Notion" (2021 — 32 shards)
- "The Great Re-Shard" (2023 — scaled to 480 shards)
- "How we sped up Notion in the browser with WASM SQLite"
- "The data model behind Notion"

---

## 2. Interview Process (4-5 rounds)

### Round 1: Recruiter Screen (~30 min)
- Background, motivation for Notion, timeline
- **Prep:** Have a crisp 60-90s "tell me about yourself" ready
- **Prep:** Know why Notion specifically (not just "I like productivity tools")

### Round 2: Technical Phone Screen (~45-60 min)
- 1 coding problem, LC Medium level, via CoderPad
- Emphasis on clean code and communication over speed
- May include a take-home project (build a simplified Notion-like feature) — reports vary by year/team

### Round 3-6: Virtual Onsite (~4 rounds in one day)

| Round | Format | What they evaluate |
|-------|--------|--------------------|
| Coding 1 (DSA) | LC Medium-Hard, 45-60 min | Algorithm skills, trees/graphs/recursion |
| Coding 2 (Applied) | Build a simplified feature, 45-60 min | Code quality, real-world problem solving |
| System Design / Product Architecture | Design a Notion-like feature, 45-60 min | API design, data modeling (lighter for new grad) |
| Culture / Craft | Behavioral + product sense, 45-60 min | Craftsmanship, user empathy, ownership |

---

## 3. Coding Prep — What Notion Asks

### Topics to focus on (in priority order)
1. **Trees / N-ary trees** — Notion's block model IS a tree. Nested blocks, indent/outdent, traversal
2. **Recursion + memoization** — recursive structures with caching, not full DP
3. **Hashmaps / Sets** — bread and butter
4. **BFS / DFS** — especially on nested document structures
5. **String manipulation / parsing** — markdown, rich text
6. **Intervals** — merge intervals, calendar/scheduling

### Reported Notion-specific problems
- Implement a simplified block editor (indent, outdent, move, delete on nested blocks)
- Flatten nested list / block structure (LC 341 variant)
- Serialize/deserialize N-ary tree (LC 297 variant)
- LRU Cache (LC 146)
- Autocomplete / trie-based search
- Parse markdown or rich text recursively
- Design a spreadsheet formula evaluator (handle cycles)
- Clone graph / deep copy nested structure (LC 133)

### LeetCode practice list
| # | Problem | Why |
|---|---------|-----|
| 341 | Flatten Nested List Iterator | Block flattening |
| 297 | Serialize/Deserialize Binary Tree | Tree persistence |
| 146 | LRU Cache | Phone screen classic |
| 133 | Clone Graph | Deep copy structures |
| 56 | Merge Intervals | Calendar/scheduling |
| 208 | Implement Trie | Search/autocomplete |
| 589 | N-ary Tree Preorder Traversal | Block traversal |
| 430 | Flatten Multilevel Doubly Linked List | Nested structure ops |
| 1472 | Design Browser History | Editor operations |
| 385 | Mini Parser | Nested structure parsing |

### How Notion coding rounds differ from FAANG
- Problems are often **product-flavored** ("build a simplified version of X")
- **Code quality matters as much as correctness** — naming, modularity, edge cases
- Collaborative style — treat it like pair programming, respond to hints
- They want to see you clarify requirements first (problems are intentionally ambiguous)

---

## 4. System Design — New Grad Level

For new grads, expect a **lighter** system design round focused on:
- API design for a Notion feature
- Data modeling (the block model, relations between pages/databases)
- Real-time collaboration basics (OT vs CRDT, conflict resolution)

### Concepts to know
- **Block-based data model:** How to schema a recursive block tree in a relational DB
- **Application-level sharding:** Shard by workspace ID, all data co-locates
- **Real-time collaboration:** OT (Operational Transform) vs CRDT basics
- **Offline sync:** Client-side SQLite cache, conflict resolution on reconnect
- **Event-driven architecture:** Kafka for async processing

### Practice question
"Design a simplified collaborative document editor" — be able to discuss:
- Block storage schema (id, type, content, parent_id, position)
- Real-time sync approach (WebSocket + OT/CRDT)
- How multiple users edit without conflicts
- How you'd shard the data as it scales

---

## 5. Know Your Numbers Cold

Interviewers probe specifics. Memorize these — don't fumble for them mid-answer.

| Number | Context | Story it belongs to |
|--------|---------|---------------------|
| 50% latency cut | Redis caching + MongoDB pipeline optimization | Grownited |
| 40% DB read reduction | Same caching project | Grownited |
| <60 seconds | Health score streaming target, 5 parallel workers | CodePulse |
| <50ms | pgvector cosine search for drift detection | CodePulse |
| <400ms | SSE streaming for agentic AI layer | CodePulse |
| 40+ endpoints | RBAC-secured with zero cross-group leakage | CareConnect |
| 5-role RBAC | Per-membership least-privilege model | CareConnect |
| 0 cross-group leaks | Multi-tenant data isolation | CareConnect |
| 0 job loss | Durable execution with step-level checkpointing | PromptStudio |
| 50+ race conditions | Diagnosed across student submissions | TA role |
| 80% turnaround cut | Automated grading framework | TA role |
| 60% resolution time cut | Faster bug diagnosis via tooling | TA role |
| 30% defect rate reduction | Catching concurrency bugs, N+1, injection vulns | TA role |
| 1,369 weekly downloads | canvas-grade-manager on npm | TA role |
| 6+ TAs, 150+ students | Users of the CLI tool | TA role |
| 100+ students | Mentored on full-stack development | TA role |
| 80+ submissions/week | Weekly grading volume | TA role |
| 15+ endpoints secured | Role-scoped access controls, zero privilege escalation | Grownited |
| 35% reporting turnaround cut | React CRM dashboards | Grownited |
| 3.86 / 4.00 GPA | Stevens MS CS | Education |
| 3 agents, 10 iterations | Agent pipeline with routing loop | PromptStudio |
| 3 Zod-validated tools | Terminal, file CRUD, read | PromptStudio |
| 5 BullMQ workers | Parallel analysis dimensions | CodePulse |
| 6 tools | RAG chat tool-calling functions | CodePulse |
| 4 cron jobs | Recurring tasks, overdue, reminders, cleanup | CareConnect |

---

## 6. Behavioral — Your Story Map

Notion values **craftsmanship, user empathy, ownership, and product sense**. They care less about "tell me about a conflict" and more about "how do you drive projects independently."

| Likely question | Your best story | Why it works for Notion |
|-----------------|-----------------|------------------------|
| Tell me about yourself | 60-90s: MS CS Stevens + TA → CareConnect/CodePulse → backend/full-stack | Sets up builder identity |
| Most impactful project | CareConnect — parallel panic-alert system | Real-time, user safety, craftsmanship |
| Hardest technical problem | CodePulse — 5 parallel workers under 60s budget | Concurrency, system design, measurable target |
| A hard bug you debugged | TA — diagnosing async race conditions | Pattern recognition, teaching (Notion values this) |
| A trade-off you made | Grownited — cutting latency 50% with Redis caching | Cache invalidation reasoning, production impact |
| Leadership / helping others | Mentoring 100+ students + canvas-grade-manager npm | Building tools for others = Notion's mission |
| Learning something quickly | PromptStudio — unfamiliar agent infra (Inngest, E2B) | Self-direction, shipping on new tech |
| A time you failed | CareConnect — duplicate notifications (at-most-once fix) | Delivery guarantees, testing edge cases |
| Conflict / disagreement | CodePulse — sequential vs. parallel (anchored to latency target) | Data-driven design decisions |
| Why Notion? | See full script in notion-qa.md Q2 | Product love + technical depth |

**Full scripted answers for all questions:** See [notion-qa.md](notion-qa.md)

### "Why Notion?" script (customize this)

> I've been a daily Notion user for [X years] — it's how I organize my coursework, job search, and project docs. What draws me to the engineering side is the ambition of the block model — the idea that everything is a composable block means you can build pages, databases, wikis, and now AI workflows on one primitive. That's an elegant architectural bet.
>
> Technically, I'm excited about the challenges at your scale — I read the PostgreSQL sharding posts and the WASM SQLite work, and those are exactly the kinds of problems I want to spend my career on. My background in real-time systems (Socket.IO in CareConnect, BullMQ workers in CodePulse) and multi-tenant data isolation maps directly to the collaborative editing and workspace-level data challenges you're solving.

---

## 7. Your Fit — Strengths to Emphasize

| Notion cares about | Your signal |
|---------------------|-------------|
| Block-based / tree data structures | CareConnect: recursive user deletion with ownership transfer, nested care groups |
| Real-time collaboration | Socket.IO group chat with edit history, read receipts; panic alert fan-out |
| PostgreSQL at scale | CodePulse: pgvector cosine search on multi-tenant Prisma schema |
| Code quality / craftsmanship | Published npm package (canvas-grade-manager), automated grading framework |
| Product sense | Built user-facing products end-to-end (CareConnect, PromptStudio, CodePulse) |
| AI integration | PromptStudio (agentic pipeline), CodePulse (RAG chat, MCP, multi-agent) |
| Caching / performance | Grownited: 50% latency cut, 40% DB read reduction via Redis |

### Gaps to acknowledge honestly
- No experience at Notion's scale (500B+ rows, 480 shards)
- No Kotlin/JVM production experience (your stack is Node/TS)
- No CRDT/OT implementation experience (understand concepts, haven't built one)
- Limited to 6-month internship for professional experience

**How to frame gaps:** "I haven't worked at that scale, but I've built the same patterns at a smaller scale — multi-tenant sharding in CodePulse, real-time sync in CareConnect — and I'm eager to learn how those patterns evolve at Notion's scale."

---

## 8. Reverse Questions (pick 2-3)

1. "I read about the re-shard from 32 to 480 Postgres instances — how does the team decide when it's time to re-shard again, and what does that planning process look like?"
2. "How does the block model handle the tension between schema flexibility and query performance as Notion adds more block types?"
3. "With Notion AI, how does the AI team collaborate with product engineers — is AI infra a separate team, or does every product engineer touch LLM integrations?"
4. "What does a new grad's first 90 days look like? How much ownership do you get early on?"
5. "How does Notion think about offline-first vs. real-time-first as the product expands to mobile?"

---

## 9. Logistics Checklist

- [ ] **Apply:** Submit to both [New Grad](https://jobs.ashbyhq.com/notion/a6311f97-4850-4674-a5f3-d9fe5f6f2555) and [New Grad AI](https://jobs.ashbyhq.com/notion/7e6dc7fe-7ddd-42c1-8928-13f7bddb9ec9)
- [ ] **Referral:** Check LinkedIn for Stevens/Grownited connections at Notion
- [ ] **Product fluency:** Use Notion daily for 2+ weeks; build real workflows with databases, relations, rollups
- [ ] **Read:** All 4 must-read engineering blog posts listed above
- [ ] **DSA:** Complete the 10 LeetCode problems in the practice list
- [ ] **System design:** Be able to whiteboard "design a collaborative block editor" in 30 min
- [ ] **Mock interview:** Do at least 1 mock with collaborative/pair-programming style
- [ ] **Stories:** Review and customize all 7 STAR stories — especially the failure + conflict drafts (marked ⚠️ in story-bank.md)
- [ ] **Numbers:** Memorize every row in the "Know Your Numbers Cold" table above
- [ ] **Sponsorship:** Notion sponsors (confirmed in config.yml). Don't volunteer F-1 status; if they raise work auth, confirm OPT-eligible May 2026

---

## 10. Compensation Context

| Component | New Grad Range |
|-----------|---------------|
| Base | $130K - $155K |
| Stock (RSUs, 4yr) | $80K - $150K |
| Signing bonus | $15K - $30K |
| **Year 1 TC** | **~$180K - $225K** |

Note: Notion is private (~$10B valuation), so equity is less liquid than public company RSUs. Consider negotiating higher base/signing to offset.

---

*Generated 2026-06-13. Full scripted Q&A: [notion-qa.md](notion-qa.md). Zero-token scaffold: `node prep.mjs Notion`.*
