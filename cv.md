# Harshil Modh

Hoboken, NJ, USA | (551) 267-0683 | hmodh@stevens.edu | [LinkedIn](https://www.linkedin.com/in/harshil-modh-53a62a1a6) | [GitHub](https://github.com/harshilmodh) | [Portfolio](https://www.harshilmodh.app)

## Education

**Stevens Institute of Technology** — USA
Master of Science in Computer Science; GPA: 3.86/4.00
*2024 – 2026*

**LDRP Institute of Technology and Research** — India
Bachelor of Engineering, Computer Science
*2019 – 2023*

## Experience

### Teaching Assistant, CS 546 Web Programming
**Stevens Institute of Technology** — Hoboken, NJ
*Sept 2025 – Present*

- Mentored 100+ graduate students on full-stack development, REST APIs, GraphQL, and backend design; caught concurrency bugs, N+1 patterns, and injection vulnerabilities across 80+ weekly submissions, reducing critical defect rate by 30%.
- Built an automated grading framework asserting HTTP responses, JSON contracts, and DB state, cutting turnaround by 80%.
- Diagnosed 50+ cases of async race conditions, middleware misconfigurations, and ORM inefficiencies, reducing resolution time 60%.
- Published `canvas-grade-manager` to npm: CLI automating Canvas late-penalty removal, submission downloads, and grading reports; 6+ TAs, 150+ students, 1,369 weekly downloads.
- **Skills:** Node.js, React, TypeScript, MongoDB, NoSQL, GraphQL, Docker, REST APIs, Canvas API, npm

### Software Engineer Intern
**Grownited** — India
*July 2023 – Jan 2024*

- Architected RBAC-gated CRM modules with least-privilege enforcement via JWT and Express middleware, eliminating unauthorized cross-role data access in production.
- Cut API latency by 50% and DB read operations by 40% via Redis caching and optimized MongoDB aggregation pipelines.
- Secured 15+ REST API endpoints with role-scoped access controls, enabling zero privilege-escalation incidents in production.
- Built React-based CRM dashboards consuming role-scoped APIs, reducing internal reporting turnaround time by 35%.
- **Skills:** JavaScript, React, Node.js, Express, MongoDB, Redis, JWT, RBAC, Docker, GitHub Actions, CI/CD

## Projects

### CareConnect — Real-Time Caregiving Platform
[GitHub](https://github.com/harshilmodh/careconnect) | [Live](https://careconnect.live)

- Architected a MERN caregiving platform with 5-role RBAC, per-membership least-privilege checks on every data operation, and dual-path auth (JWT fallback to Firebase Admin SDK) securing 40+ endpoints with zero cross-group data leakage.
- Cut database query load by 50% with a Redis caching layer; managed stateless sessions via TTL-based refresh tokens; offloaded documents to AWS S3 pre-signed URLs; shipped four-service Docker Compose stack on AWS EC2.
- Built real-time Socket.IO group chat with message edit history, read receipts, and admin-only delete; wired a one-tap panic alert that fans out notifications, chat messages, and styled HTML emails to every group member in parallel.
- Implemented atomic medication dose tracking with supply-count decrement, recursive user deletion with ownership transfer, and four cron jobs: recurring task generation, 15-min overdue detection, per-minute reminders with dedup, and stale notification cleanup.
- **Skills:** React, Node.js, Express, MongoDB, Redis, Socket.IO, Firebase Auth, AWS EC2, AWS S3, Docker, Nodemailer

### CodePulse — AI-Powered Repository Health Analyzer
[GitHub](https://github.com/harshilmodh/codepulse)

- Architected a full-stack code analysis platform that runs 5 parallel BullMQ workers per push analyzing complexity, vulnerabilities, dead code, coverage, and architectural drift and streams a weighted health score (0–100) in under 60 seconds.
- Built an agentic AI layer on GPT-4o-mini: tool-calling RAG chat (6 tools), root cause investigator, multi-agent refactor debate, and codebase tour streamed via SSE under 400ms; exposed to third-party IDEs and coding assistants via MCP.
- Detected drift via pgvector cosine search over OpenAI embeddings; flagged outliers in under 50ms on a multi-tenant Prisma schema.
- Built a Next.js dashboard with Clerk auth, TanStack Query live polling, Recharts, and D3; integrated Stripe billing (Free/Pro/Team) with webhook-verified checkout.
- Coordinated 5 workers via Redis pub/sub with Socket.IO fanout; secured webhooks with HMAC-SHA256; persisted via Prisma.
- **Skills:** Node.js, BullMQ, Redis, PostgreSQL, pgvector, Prisma, OpenAI API, Socket.IO, Next.js, TypeScript, D3, Clerk, Docker

### PromptStudio — AI Code Generation and Execution System
[GitHub](https://github.com/harshilmodh/promptstudio) | [Live](https://promptstudio.live)

- Engineered a fault-tolerant AI pipeline using Inngest durable jobs with step-level checkpointing and automatic retry, orchestrating terminal commands and file I/O inside isolated E2B sandboxes achieving zero job loss on transient failures.
- Designed a 3-agent pipeline via @inngest/agent-kit with a 10-iteration routing loop and 3 Zod-validated tools (terminal, file CRUD, read); generates runnable Next.js apps from natural language with auto-termination on task-summary extraction.
- Provisioned E2B sandboxes from a custom Dockerfile (Next.js 16 + Shadcn pre-installed with npm retry logic); backed versioned code fragment history and session replay in PostgreSQL via Prisma, eliminating context re-entry across sessions.
- Enforced per-user credit consumption with Free/Pro tiers via RateLimiterPrisma on a 30-day rolling window; built a resizable split-pane IDE with live sandbox preview, file explorer, Shiki syntax highlighting, and TanStack Query 5s polling.
- **Skills:** Next.js, React, Inngest, OpenAI API, E2B, PostgreSQL, Prisma, Clerk, TanStack Query, Zod

## Skills

- **Languages:** JavaScript, TypeScript, Python, Java, SQL, C, C++
- **Frontend:** React, Next.js, Tailwind CSS, Bootstrap, shadcn/ui, TanStack Query, Framer Motion, Recharts, D3
- **Backend:** Node.js, Express, Flask, REST APIs, GraphQL, Socket.IO, Redis, BullMQ, Cron Jobs, Nodemailer, Zod
- **Databases:** MongoDB, PostgreSQL, pgvector, MySQL, Firestore, Prisma
- **Cloud / DevOps:** AWS EC2, AWS S3, Docker, GitHub Actions, CI/CD, Linux
- **AI / LLM:** OpenAI API, Google Gemini API, Inngest, E2B, Vapi.ai, Deepgram, Vercel AI SDK, MCP, LLM Engineering
- **Auth & Billing:** Firebase Auth, Clerk, OAuth, JWT, RBAC, HMAC-SHA256, Rate Limiting, Stripe
- **Tools:** Git, GitHub, Postman, Cursor, GitHub Copilot, Octokit
