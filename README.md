<p align="center">
  <h1 align="center">🔎 jobhunt</h1>
  <p align="center">
    <strong>A self-contained, CLI-first job search toolkit that scans 90+ company ATS boards & LinkedIn, dual-scores every opening against your résumé, finds referral targets, and preps you for interviews — all from one config file.</strong>
  </p>
  <p align="center">
    No CV generation · No auto-apply · No bloat · ~10 files, one config
  </p>
</p>

---

## Table of Contents

- [Why This Exists](#why-this-exists)
- [Features](#features)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Daily Workflow](#daily-workflow)
- [Command Reference](#command-reference)
  - [`jobhunt.mjs` — Interactive CLI](#jobhuntmjs--interactive-cli)
  - [`scan.mjs` — Board Scanner](#scanmjs--board-scanner)
  - [`linkedin.mjs` — LinkedIn Scanner](#linkedinmjs--linkedin-scanner)
  - [`rank.mjs` — Scoring Engine](#rankmjs--scoring-engine)
  - [`linkedin-recent.mjs` — Windowed LinkedIn View](#linkedin-recentmjs--windowed-linkedin-view)
  - [`today.mjs` — Daily Briefing](#todaymjs--daily-briefing)
  - [`keywords.mjs` — JD Skill Gap Analyzer](#keywordsmjs--jd-skill-gap-analyzer)
  - [`referrals.mjs` — Referral Finder](#referralsmjs--referral-finder)
  - [`prep.mjs` — Interview Prep Scaffold](#prepmjs--interview-prep-scaffold)
  - [People Grabber Bookmarklet](#people-grabber-bookmarklet)
- [Scoring System](#scoring-system)
  - [Heuristic Score (deterministic, 0–100)](#heuristic-score-deterministic-0100)
  - [AI Score (Gemini, 0–100)](#ai-score-gemini-0100)
  - [Signal Flags](#signal-flags)
- [Configuration](#configuration)
  - [`config.yml` Structure](#configyml-structure)
  - [`cv.md` — Your Résumé](#cvmd--your-résumé)
- [Data Files](#data-files)
- [Supported ATS Providers](#supported-ats-providers)
- [Company Coverage](#company-coverage)
- [AI Agent Integration](#ai-agent-integration)
- [Honest Caveats](#honest-caveats)
- [License](#license)

---

## Why This Exists

New-grad SWE roles fill in 48 hours. By the time you manually check 90 companies, the best postings are gone. Existing tools either cost money, auto-apply (and get you banned), or generate PDFs you didn't ask for.

**jobhunt** does exactly one thing well: **surface the right openings fast and help you act on them**. It scans ATS APIs directly, scores every opening against your profile with a free heuristic + optional Gemini AI, and gives you referral search links + message drafts — so you spend your time applying and networking, not tab-surfing.

## Features

| Category | What It Does |
|----------|-------------|
| **Board Scanning** | Hits 90+ company ATS APIs (Greenhouse, Ashby, Lever, Workable, Workday) in parallel — zero tokens, pure HTTP |
| **LinkedIn Discovery** | Paginated guest-endpoint search across 13+ keyword × location queries, fetches JD text for each |
| **Dual Scoring** | Deterministic heuristic (tier + title + location + skills + sponsorship + salary + freshness) **plus** optional Gemini AI score that reads the full JD vs your résumé |
| **Ranked Leaderboards** | `data/top-openings.md` (boards) and `data/linkedin-openings.md` (LinkedIn) — markdown tables, sorted, with signal flags |
| **Daily Briefing** | One-command view: unapplied top openings → referral nudges due → application follow-ups → pipeline counts |
| **Keyword Gap** | Compares JD tech requirements against your `cv.md`; shows what's missing so you can decide what to honestly add |
| **Referral Finder** | Generates per-company LinkedIn search URLs (alumni + ex-colleagues), DM drafts (≤300 chars), email drafts with `mailto:` links |
| **Follow-up Cadence** | Tracks referral outreach with 6/12-day nudge reminders; auto-generates nudge text |
| **Email Guesser** | `--email "Name" domain.com` outputs likely corporate address patterns (most → least common) |
| **Interview Prep** | Maps your STAR+R story bank to each company's likely question buckets; scaffolds `interview-prep/{company}.md` |
| **People Grabber** | Browser bookmarklet that copies LinkedIn search results into a clean table (Name, Headline, URL) |
| **Application Tracker** | `data/applications.md` — simple markdown table; `today.mjs` reads it for follow-up reminders |
| **Freshness Windows** | Choose 24h / 4d / 7d / 14d / everything; `linkedin-recent.md` holds only your chosen window, replaced each run |
| **AI Agent Extensions** | Deeper evaluation, interview prep, and outreach drafting via Claude/Gemini Code (instructions in `AGENTS.md`) |

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        jobhunt.mjs                              │
│               (interactive CLI — orchestrates all)               │
└──────────┬───────────────┬───────────────┬──────────────────────┘
           │               │               │
     ┌─────▼─────┐  ┌─────▼──────┐  ┌─────▼─────┐
     │  scan.mjs  │  │ linkedin.  │  │  rank.mjs │
     │ board scan │  │    mjs     │  │  scoring   │
     │ 5 providers│  │ LI search  │  │ heur + AI  │
     └─────┬──────┘  └─────┬──────┘  └─────┬─────┘
           │               │               │
           ▼               ▼               ▼
   data/pipeline.md  data/linkedin-   data/top-openings.md
   data/scan-        jds.json         data/linkedin-openings.md
   history.tsv                        data/ai-scores.json
           │                                │
     ┌─────┴────────────────────────────────┘
     │
     ├── today.mjs .............. daily briefing
     ├── keywords.mjs .......... JD skill-gap check
     ├── referrals.mjs ......... referral targets + drafts
     ├── prep.mjs .............. interview prep scaffold
     └── linkedin-recent.mjs ... windowed LinkedIn slice

Config:  config.yml (single source of truth)
Résumé:  cv.md (drives skill scoring)
Stories: data/story-bank.md (8 STAR+R stories)
```

---

## Quick Start

### Prerequisites

- **Node.js** ≥ 18 (uses native `fetch`)
- **npm** (comes with Node)
- **Gemini CLI** (optional, for AI scoring — free tier)

### Installation

```bash
git clone https://github.com/harshilmodh/jobhunt.git
cd jobhunt
npm install                          # installs js-yaml (the only dependency)
```

### Optional: AI Scoring (Free)

```bash
npm i -g @google/gemini-cli && gemini   # log in once, then AI scoring works
```

### Configure

1. **Edit `config.yml`** — this is the single source of truth. Update:
   - `profile` — your name, contact info, education, target roles, comp expectations, skills
   - `companies` — add/remove companies, set tiers (1/2/3), add notes
   - `title_filter` — positive/negative title keywords
   - `location_filter` — allowed/blocked locations
   - `linkedin` — search queries and pagination settings

2. **Edit `cv.md`** — paste your résumé in markdown. The scorer compares JD skills against this file.

3. **Edit `data/story-bank.md`** — your STAR+R interview stories. The prep scaffold maps these to question buckets.

### First Run

```bash
node jobhunt.mjs
```

Select "Everything" for the freshness window on your first run. This will:
1. Scan all enabled company ATS boards (~10 sec)
2. Optionally scan LinkedIn (~3-8 min)
3. Score and rank everything against your profile
4. Generate your leaderboards

---

## Daily Workflow

```
Morning:
  1. node jobhunt.mjs            # scan + rank (pick "24 hours" for daily delta)
  2. node today.mjs              # one-screen: apply list + nudges + follow-ups
  3. Apply to top matches        # 🎓 + ✅ + 🆕 = highest priority

Before applying:
  4. node keywords.mjs <url>     # check skill gaps for a specific JD

Networking:
  5. node referrals.mjs          # get search links + message drafts
  6. node referrals.mjs --followups  # who to nudge today

Interview prep:
  7. node prep.mjs <company>     # zero-token scaffold
  8. claude → "prep me for X"    # deep version (web research + JD analysis)
```

### Reading the Leaderboard

Open `data/top-openings.md` or `data/linkedin-openings.md`. Each is a markdown table:

| # | AI | Score | Company | Role | Location | Posted | Salary | Signals |
|---|:--:|:-----:|---------|------|----------|--------|--------|---------|
| 1 | **88** | 76 | Stripe | Software Engineer, New Grad | NYC | 2026-06-10 (2d) | $150k–$200k | 🎓 new-grad ✅ sponsors 🆕 |

- **AI** — Gemini's full-JD-vs-résumé score (lead with this for apply decisions)
- **Score** — deterministic heuristic (transparent cross-check)
- **Signals** — at-a-glance flags (see [Signal Flags](#signal-flags))

**Prioritize:** High AI + high heuristic + 🎓 + ✅ + 🆕. Skip ⚠️ no-sponsor.

---

## Command Reference

### `jobhunt.mjs` — Interactive CLI

The main entry point. Orchestrates scanning, LinkedIn discovery, and ranking in one interactive session.

```bash
node jobhunt.mjs
```

**Interactive prompts:**
1. **Freshness window** — filters the ranked view (24h / 4d / 7d / 14d / everything)
2. **LinkedIn scan** — optional, ~3-8 min, produces a separate list
3. **Gemini AI scores** — optional, free tier, cached (never re-scores a job)

**Outputs:**
| File | Content |
|------|---------|
| `data/top-openings.md` | Job board leaderboard (90+ companies), ranked, dual-scored |
| `data/linkedin-openings.md` | LinkedIn — full list, AI-scored from the JD |
| `data/linkedin-recent.md` | LinkedIn — only your chosen window, replaced each run |

---

### `scan.mjs` — Board Scanner

Reads companies from `config.yml`, hits their ATS APIs directly, applies title + location filters, and deduplicates against history.

```bash
node scan.mjs                     # scan all enabled companies
node scan.mjs --dry-run            # preview — write nothing
node scan.mjs --company nvidia     # scan one company (substring match)
```

**How it works:**
1. Detects the ATS provider from each company's `careers_url`
2. Hits the public API (Greenhouse JSON API, Ashby posting API, Lever API, Workable jobs feed, Workday CXS search)
3. Applies `title_filter` (positive + negative keywords) and `location_filter`
4. Deduplicates against `data/scan-history.tsv` + `data/pipeline.md`
5. Appends new openings to both files
6. Runs 10 companies in parallel (configurable `CONCURRENCY`)

**Zero tokens** — pure HTTP + JSON, no AI, no login required.

---

### `linkedin.mjs` — LinkedIn Scanner

Port of the n8n "Job search ultimate workflow." Hits LinkedIn's guest search endpoint for all queries defined in `config.yml`.

```bash
node linkedin.mjs                  # default: last 96 hours
node linkedin.mjs --hours 48       # last 48 hours
node linkedin.mjs --dry-run        # preview — write nothing
```

**How it works:**
1. Paginates each query (6 pages × 10 results per page by default)
2. Deduplicates against scan history
3. Fetches full JD text for each new job (capped at `max_new_per_run`, default 150)
4. Writes to `data/linkedin-jds.json` (JD cache) + `data/scan-history.tsv`
5. Polite delays (2.5–5s jitter between requests); backs off on rate-limit (429/999)

**No title filter on purpose** — LinkedIn's level metadata is unreliable, so Gemini scores every job from the actual JD text.

> ⚠️ LinkedIn scraping is unofficial and against ToS. Kept isolated so the board scan never depends on it. Personal use, low volume only.

---

### `rank.mjs` — Scoring Engine

Scores all openings against your profile using a deterministic heuristic + optional Gemini AI.

```bash
node rank.mjs                      # heuristic only
node rank.mjs --ai                 # + Gemini AI scores (free tier, cached)
node rank.mjs --days 7             # only openings posted in the last 7 days
node rank.mjs --top 30             # size of the apply-first table (default: 30)
```

**Two separate lists** (LinkedIn is noisier, kept apart):
- `data/top-openings.md` — job boards (from `data/pipeline.md`)
- `data/linkedin-openings.md` — LinkedIn (from `data/linkedin-jds.json`)

**AI scoring details:**
- Only scores openings with heuristic ≥ 65 (boards) or all (LinkedIn)
- Batches 5 jobs per Gemini CLI call
- Caches results in `data/ai-scores.json` — never re-scores a cached job
- Prompt engineered as an expert Engineering Manager evaluating entry-level candidates
- F-1/OPT penalty: -40 points if JD says no sponsorship

---

### `linkedin-recent.mjs` — Windowed LinkedIn View

Filters the full LinkedIn list down to your chosen freshness window.

```bash
node linkedin-recent.mjs             # last 24 hours (default)
node linkedin-recent.mjs --days 4    # last 4 days
```

**Overwrites** `data/linkedin-recent.md` on every run — always shows your latest window, never piles up. The full list stays complete in `data/linkedin-openings.md`.

---

### `today.mjs` — Daily Briefing

Your daily to-do, in one screen.

```bash
node today.mjs                     # apply list (score ≥ 70)
node today.mjs --min 80            # raise the threshold
node today.mjs --new               # only 🆕 (posted ≤ 7 days)
```

**Four sections:**

| # | Section | What |
|---|---------|------|
| ① | **Apply First** | Top openings you haven't applied to yet (reads `data/applications.md` for dedup) |
| ② | **Referral Nudges Due** | People you contacted who haven't replied in 6/12 days |
| ③ | **Application Follow-ups** | Applications > 7 days old with no response |
| ④ | **Pipeline** | Status counts from your application tracker |

---

### `keywords.mjs` — JD Skill Gap Analyzer

Fetches a job description and shows which technical skills the JD names that **aren't** in your `cv.md`.

```bash
node keywords.mjs <job-url>        # any supported ATS or cached LinkedIn URL
node keywords.mjs Notion           # company name → uses its top opening's URL
```

**Supported sources:** Greenhouse, Ashby, Lever, Workday, LinkedIn (cached from `data/linkedin-jds.json`)

**Vocabulary:** 60+ canonical tech skills with regex matching (JavaScript, Python, Docker, Kubernetes, Redis, pgvector, LLM, RAG, etc.)

**Output:**
```
✅ JD skills you already have (12): JavaScript, TypeScript, Node.js, ...
⚠️  JD skills MISSING from your résumé (3): Go, Kubernetes, Terraform

   → Only add ones you can honestly back up.
```

---

### `referrals.mjs` — Referral Finder

Generates a per-company referral worksheet with LinkedIn search URLs + message drafts.

```bash
node referrals.mjs                          # top 15 companies from leaderboards
node referrals.mjs --top 25                 # more companies
node referrals.mjs --min-ai 80             # only high-scoring companies
node referrals.mjs --followups              # who to nudge today (6/12-day cadence)
node referrals.mjs --email "Jane Doe" co.com  # guess likely email patterns
```

**Per-company block includes:**
- LinkedIn people-search URLs (alumni from your schools + ex-colleagues)
- LinkedIn DM draft (≤300 chars, personalized template)
- Email draft with `mailto:` link (opens mail client pre-filled)
- Alumni tool link for school-based searches

**Follow-up cadence:**
- First nudge: 6 days after initial contact
- Second nudge: 12 days after initial contact
- Max 2 nudges, then stops reminding

**Email guesser patterns** (most → least common):
```
1. jane.doe@company.com
2. janedoe@company.com
3. jdoe@company.com
4. jane@company.com
...
```

**Outputs:**
- `data/referral-targets.md` — clickable worksheet
- `data/referrals.md` — outreach tracker (you log contacts manually)

**Agency filter:** Automatically skips known staffing/consulting agencies (BeaconFire, SynergisticIT, etc.)

> ⚠️ You send every message yourself. The tool never scrapes people, sends requests, or messages anyone.

---

### `prep.mjs` — Interview Prep Scaffold

Zero-token interview prep document that maps your story bank to a company's likely questions.

```bash
node prep.mjs Notion
node prep.mjs "Hudson River Trading"
```

**What it generates** (`interview-prep/{company}.md`):
1. Role details from your leaderboard (title, URL, fit score)
2. Behavioral question → story mapping table (9 question buckets × your 8 STAR+R stories)
3. Technical checklist (DSA, architecture whiteboard, numbers, reverse questions)
4. Sponsorship reminder (F-1/OPT talking points)

**For the deep version** (real process research, JD-mapped questions, company research), use:
```bash
claude → "prep me for Notion"
```

---

### People Grabber Bookmarklet

A browser bookmarklet that copies people from a LinkedIn search page into a clean table.

**Install (one-time):**
1. Show your browser's bookmarks bar
2. Add a new bookmark named `Grab People`
3. Paste the contents of `bookmarklet.txt` as the URL

**Use:**
1. Run a LinkedIn People search (e.g., from a `data/referral-targets.md` link)
2. Scroll so all results load
3. Click the `Grab People` bookmark — copies to clipboard
4. Paste into a spreadsheet or markdown file

**Rebuild** (if LinkedIn changes their page structure):
```bash
node make-bookmarklet.mjs
```

> ⚠️ This is a copy helper for pages you're already reading — not a crawler.

---

## Scoring System

### Heuristic Score (deterministic, 0–100)

| Factor | Points | Details |
|--------|:------:|---------|
| **Base** | 30 | Starting score |
| **Company tier** | +5 to +14 | Tier 1 = +14, Tier 2 = +9, Tier 3 = +5 |
| **Title: new-grad/intern** | +16 to +20 | "New Grad", "Entry Level", "Engineer I", "Intern" |
| **Title: role type** | -4 to +10 | Backend/Full-Stack = +10, AI/ML = +7, Platform = +5, Frontend = -4, QA = -8 |
| **Title: non-engineer** | -20 | No "engineer/developer/swe/sde/intern" in title |
| **Location: NYC** | +12 | NY/NYC/Hoboken/Jersey City/Brooklyn |
| **Location: Remote** | +8 | |
| **Location: SF/Seattle/Boston** | +6 | |
| **Skill overlap** | up to +18 | Expert skills = +2 each (cap 12), Strong skills = +1 each (cap 6) |
| **Experience ask: 5+ years** | -25 | Also flagged ⏳ |
| **Experience ask: 3+ years** | -12 | Also flagged ⏳ |
| **New-grad JD language** | +6 | "new grad", "recent graduate", "no prior experience" |
| **Sponsorship: negative** | -35 | "unable to sponsor", "citizenship required", etc. → ⚠️ flag |
| **Sponsorship: positive** | +5 | "we sponsor", "H-1B", "OPT" → ✅ flag |
| **Salary** | +2 to +4 | Based on posted salary range |
| **Freshness: ≤7 days** | +4 | → 🆕 flag |
| **Freshness: ≤14 days** | +2 | |
| **Freshness: 180+ days** | -6 | → 📅 evergreen flag |

### AI Score (Gemini, 0–100)

Gemini reads the full JD vs your résumé with this rubric:

| Component | Weight |
|-----------|:------:|
| Skills overlap (languages, DSA, distributed systems, cloud/Docker) | 40 |
| Relevant experience (internships, TA, projects) | 25 |
| Responsibilities alignment (junior/entry-level tasks) | 15 |
| Education fit (MS students / recent MSCS grads) | 10 |
| Domain/industry fit | 5 |
| Logistics | 5 |

**Critical deductions:**
- Up to -30 if the role requires 3+ years or is mid/senior
- -40 if the JD says no visa sponsorship / US citizenship / clearance

### Signal Flags

| Flag | Meaning |
|------|---------|
| 🎓 | New-grad or intern title detected |
| 🗽 | NYC-area location |
| ✅ | JD mentions visa sponsorship positively |
| ⚠️ | JD says no sponsorship / citizenship required — **skip** |
| 🆕 | Posted ≤ 7 days ago — **apply same day** |
| ⏳ | JD asks for 3+ years experience |
| 📅 | Evergreen posting (6+ months old) |
| 💬 | Gemini's one-line AI reason |

---

## Configuration

### `config.yml` Structure

The single config file drives everything. Key sections:

```yaml
profile:
  name: Your Name
  education: ...
  work_authorization:
    status: F-1 student, OPT eligible May 2026
    sponsorship_required: true
  target_roles:
    primary: [Backend Engineer, Full-Stack Engineer, ...]
    secondary: [AI/ML Engineer, Platform Engineer, ...]
  core_stack:
    expert: [JavaScript/TypeScript, Node.js, React, MongoDB, ...]
    strong: [PostgreSQL, Redis, Docker, AWS, ...]
    working: [Python, GraphQL, LLM APIs, ...]
  target_companies:
    tier_1_dream: [Google, Stripe, Datadog, ...]
    tier_2_strong: [Amazon, Robinhood, Ramp, ...]
    tier_3_apply_if_role_fits: [IBM, Cisco, ...]

title_filter:
  positive: [Software Engineer, Backend, New Grad, Intern, ...]
  negative: [Senior, Staff, Lead, Principal, Manager, ...]

location_filter:
  always_allow: [United States, New York, NYC, Remote, ...]
  block: [India, United Kingdom, Canada, ...]

linkedin:
  max_new_per_run: 150
  pages: 6
  queries:
    - { keywords: Software Engineer, location: United States }
    - { keywords: Backend Engineer, location: New York City }
    ...

companies:
  - { name: Stripe, careers_url: https://job-boards.greenhouse.io/stripe, tier: 1 }
  - { name: OpenAI, careers_url: https://jobs.ashbyhq.com/openai, tier: 1 }
  ...
```

### Adding a Company

Drop a new entry into `config.yml` → `companies`:

```yaml
- name: Acme Corp
  careers_url: https://job-boards.greenhouse.io/acmecorp   # provider auto-detected
  tier: 2
  notes: NYC office, Node-heavy backend team
```

### Disabling a Company

Set `enabled: false` — it stays in the config for manual checking but isn't scanned:

```yaml
- name: Google
  enabled: false
  careers_url: https://www.google.com/about/careers/...
  tier: 1
  notes: Custom ATS — check manually; also seen via LinkedIn scan
```

### `cv.md` — Your Résumé

Your résumé in markdown. The scorer compares JD skills against this file, and Gemini reads it for AI scoring. Keep it current — a missing skill here means the heuristic can't credit you for it.

---

## Data Files

| File | Purpose | Generated By |
|------|---------|:------------:|
| `data/pipeline.md` | All board openings (checklist format) | `scan.mjs` |
| `data/scan-history.tsv` | Dedup ledger: URL, first seen, provider, title, company, status, location | `scan.mjs`, `linkedin.mjs` |
| `data/top-openings.md` | **Board leaderboard** — apply-first table + full ranking | `rank.mjs` |
| `data/linkedin-openings.md` | **LinkedIn leaderboard** — full list, AI-scored | `rank.mjs` |
| `data/linkedin-recent.md` | LinkedIn — windowed slice (24h/4d/7d/14d), replaced each run | `linkedin-recent.mjs` |
| `data/linkedin-jds.json` | LinkedIn JD text cache (keyed by URL) | `linkedin.mjs` |
| `data/ai-scores.json` | Gemini AI score cache (keyed by URL) | `rank.mjs` |
| `data/story-bank.md` | 8 STAR+R interview stories from real projects | Manual |
| `data/applications.md` | Application tracker (date, company, role, status) | Manual / AI agent |
| `data/referral-targets.md` | Per-company referral worksheet with search links + drafts | `referrals.mjs` |
| `data/referrals.md` | Outreach tracker (who you contacted, status, follow-up) | Manual |
| `interview-prep/{company}.md` | Interview prep scaffold per company | `prep.mjs` |

---

## Supported ATS Providers

The scanner auto-detects the provider from each company's `careers_url`:

| Provider | URL Pattern | API Used |
|----------|-------------|----------|
| **Greenhouse** | `job-boards.greenhouse.io/{slug}` | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` (JSON) |
| **Ashby** | `jobs.ashbyhq.com/{slug}` | `api.ashbyhq.com/posting-api/job-board/{slug}` (JSON, includes compensation) |
| **Lever** | `jobs.lever.co/{slug}` | `api.lever.co/v0/postings/{slug}` (JSON) |
| **Workable** | `apply.workable.com/{slug}` | `apply.workable.com/{slug}/jobs.md` (Markdown feed) |
| **Workday** | `{tenant}.wd{N}.myworkdayjobs.com/{site}` | CXS POST API with targeted search terms |

Companies with custom ATS (Google, Meta, Amazon, Apple, Netflix, Microsoft) are set `enabled: false` and included as manual-check bookmarks. They also surface via the LinkedIn scan.

---

## Company Coverage

**90+ verified companies** across these categories:

| Category | Companies |
|----------|-----------|
| **FAANG+** | Google, Meta, Amazon, Apple, Netflix, Microsoft, NVIDIA |
| **Top-Tier Tech** | Stripe, Plaid, Datadog, MongoDB, Snowflake, Databricks, Cloudflare, Airbnb, Uber |
| **AI/ML** | Anthropic, OpenAI, Scale AI, Hugging Face, Cursor, Sierra, ElevenLabs, Replit, xAI |
| **Developer Tools** | Figma, Notion, Vercel, Linear, GitHub, GitLab, Supabase, PostHog |
| **Fintech** | Block, Robinhood, Ramp, Brex, Coinbase, SoFi, Chime, Betterment, Affirm, Mercury |
| **Trading** | Hudson River Trading, IMC, Akuna Capital, Jump Trading, Squarepoint, DRW |
| **Consumer** | DoorDash, Discord, Reddit, Spotify, Pinterest, Lyft, Instacart, Squarespace |
| **Enterprise** | Salesforce, Adobe, ServiceNow, Workday, Capital One, Mastercard, Atlassian |
| **Infrastructure** | Temporal, Cockroach Labs, Modal, Render, Confluent, Elastic, Samsara |

---

## AI Agent Integration

`jobhunt` is designed to work with AI coding assistants (Claude Code, Gemini CLI). The `AGENTS.md` file contains detailed instructions for:

| Command | What the Agent Does |
|---------|-------------------|
| `evaluate top N` | Fetches each posting, writes `reports/{n}-{company}.md` with score, fit table, gaps, comp research, interview angle, ghost-job check |
| `prep me for {company}` | Deep interview prep: process research (Glassdoor/Blind), audience-mapped rounds, story-bank mapping, technical checklist |
| `draft outreach to {person}` | 3-sentence referral/networking message adapted to recruiter/HM/peer, ≤300 chars for LinkedIn |

These are not scripts — they're natural-language instructions the AI agent follows. Run them inside `claude` or `gemini` in the project directory.

---

## Honest Caveats

- **LinkedIn scraping is unofficial** and against LinkedIn's Terms of Service. It's isolated in `linkedin.mjs` so the board scanner (`scan.mjs`) never depends on it. It runs only when you explicitly choose to run it, at low volume, with polite delays.

- **Scores are triage, not truth.** A high score means "read this posting." A ⚠️ flag means "check sponsorship yourself." The AI and heuristic sometimes disagree — that divergence is signal.

- **No auto-apply, no auto-send.** This tool does discovery + ranking + message drafting. Applying, networking, and interviewing are yours to do. The coding gate is yours to practice.

- **Email guesses are guesses.** Always check LinkedIn "Contact info" first. A guessed pattern sent to the wrong address is wasted — or worse.

- **FAANG custom ATS boards** (Google, Meta, Amazon, Apple, Netflix, Microsoft) can't be API-scanned. They're included as manual-check bookmark URLs and surface via LinkedIn discovery.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| **Runtime** | Node.js ≥ 18 (ESM modules) |
| **Dependencies** | `js-yaml` (the only dependency) |
| **AI** | Google Gemini CLI (optional, free tier) |
| **Data format** | Markdown tables + JSON caches + TSV history |
| **Config** | YAML (single file) |

---

## License

Personal use. Not a product — a tool built for one person's job search, shared for reference.
