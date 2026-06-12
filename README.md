<div align="center">

# 🔎 jobhunt

**CLI-first job search toolkit that scans 90+ company boards & LinkedIn,<br>dual-scores every opening against your résumé, and finds referral paths.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/deps-1%20(js--yaml)-blue?style=flat-square)](package.json)
[![AI](https://img.shields.io/badge/AI-Gemini%20Free%20Tier-8E75B2?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/license-personal--use-lightgrey?style=flat-square)](#license)

`No CV generation` · `No auto-apply` · `No bloat` · `~10 files, one config`

---

</div>

## ⚡ Quick Start

```bash
git clone https://github.com/HarshilModh/jobHunt.git
cd jobHunt
npm install                                    # js-yaml — the only dependency
npm i -g @google/gemini-cli && gemini          # optional: free AI scoring (log in once)
```

> **Two files to edit before your first run:**
> - **`config.yml`** — your profile, target companies, filters (single source of truth)
> - **`cv.md`** — your résumé in markdown (drives skill scoring)

```bash
node jobhunt.mjs     # → pick "Everything" → scan + LinkedIn + rank → done
```

---

## 📋 Table of Contents

<details>
<summary><strong>Click to expand</strong></summary>

- [Why This Exists](#-why-this-exists)
- [Quick Start](#-quick-start)
- [Daily Workflow](#-daily-workflow)
- [Features at a Glance](#-features-at-a-glance)
- [Architecture](#-architecture)
- [Command Reference](#-command-reference)
- [Scoring System](#-scoring-system)
- [Configuration](#%EF%B8%8F-configuration)
- [Data Files](#-data-files)
- [Supported ATS Providers](#-supported-ats-providers)
- [Company Coverage](#-company-coverage)
- [AI Agent Integration](#-ai-agent-integration)
- [Honest Caveats](#-honest-caveats)

</details>

---

## 💡 Why This Exists

New-grad SWE roles fill in **48 hours**. By the time you manually check 90 companies, the best postings are gone. Existing tools either cost money, auto-apply (and get you banned), or generate PDFs you didn't ask for.

**jobhunt** does exactly one thing well: **surface the right openings fast and help you act on them.**

---

## 📆 Daily Workflow

```
┌─ MORNING ──────────────────────────────────────────────────┐
│                                                            │
│  ① node jobhunt.mjs          scan + rank (pick "24 hours") │
│  ② node today.mjs            one-screen daily briefing     │
│  ③ Apply to top matches      🎓 + ✅ + 🆕 = highest priority│
│                                                            │
├─ BEFORE APPLYING ──────────────────────────────────────────┤
│                                                            │
│  ④ node keywords.mjs <url>   check skill gaps for a JD    │
│                                                            │
├─ NETWORKING ───────────────────────────────────────────────┤
│                                                            │
│  ⑤ node referrals.mjs        search links + message drafts│
│  ⑥ node referrals.mjs --followups   who to nudge today    │
│                                                            │
├─ INTERVIEW PREP ──────────────────────────────────────────┤
│                                                            │
│  ⑦ node prep.mjs <company>   zero-token scaffold          │
│  ⑧ claude → "prep me for X"  deep version (web research)  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Reading the Leaderboard

Open `data/top-openings.md` or `data/linkedin-openings.md`:

| # | AI | Score | Company | Role | Posted | Signals |
|---|:--:|:-----:|---------|------|--------|---------|
| 1 | **88** | 76 | Stripe | Software Engineer, New Grad | 2d | 🎓 ✅ 🆕 |
| 2 | **82** | 71 | Datadog | SWE I — Backend | 5d | 🎓 🗽 |
| 3 | — | 68 | Ramp | Backend Engineer | 1d | 🆕 |

> **AI** = Gemini full-JD score (lead with this) · **Score** = deterministic heuristic (cross-check) · **Signals** = at-a-glance flags

**Priority:** High AI + 🎓 + ✅ + 🆕 → apply same day. Skip ⚠️ no-sponsor.

---

## 🎯 Features at a Glance

<table>
<tr>
<td width="50%">

### 📡 Discovery
- **Board scanner** — 90+ ATS APIs in parallel (zero tokens)
- **LinkedIn scanner** — 13+ search queries, full JD fetch
- **Dedup** — never shows the same job twice

### 📊 Scoring
- **Heuristic** — tier, title, location, skills, sponsorship, salary, freshness
- **Gemini AI** — reads full JD vs résumé (free tier, cached)
- **Signal flags** — 🎓 🗽 ✅ ⚠️ 🆕 ⏳ 📅 at a glance

### 🔑 Analysis
- **Keyword gap** — JD skills missing from your résumé
- **Daily briefing** — unapplied jobs + nudges + follow-ups

</td>
<td width="50%">

### 🤝 Networking
- **Referral finder** — LinkedIn search URLs per company
- **Message drafts** — DM (≤300 chars) + email with `mailto:`
- **Follow-up cadence** — 6/12-day nudge reminders
- **Email guesser** — likely corporate address patterns
- **People grabber** — bookmarklet to copy LinkedIn results

### 🎤 Interview Prep
- **Story bank** — 8 STAR+R stories mapped to question buckets
- **Prep scaffold** — zero-token `interview-prep/{company}.md`
- **Deep prep** — via AI agent (process research, JD analysis)

### 📋 Tracking
- **Application tracker** — `data/applications.md`
- **Outreach tracker** — `data/referrals.md`

</td>
</tr>
</table>

---

## 🏗 Architecture

```
                          ┌──────────────────┐
                          │   jobhunt.mjs    │  ← interactive CLI
                          │   (orchestrator) │     (you run this)
                          └───┬─────┬────┬───┘
                              │     │    │
              ┌───────────────┘     │    └───────────────┐
              ▼                     ▼                    ▼
     ┌────────────────┐  ┌─────────────────┐  ┌─────────────────┐
     │   scan.mjs     │  │  linkedin.mjs   │  │    rank.mjs     │
     │ 5 ATS providers│  │ guest endpoint  │  │ heuristic + AI  │
     │ 90+ companies  │  │ 13+ queries     │  │ dual scoring    │
     └───────┬────────┘  └───────┬─────────┘  └───────┬─────────┘
             │                   │                     │
             ▼                   ▼                     ▼
      data/pipeline.md    data/linkedin-       data/top-openings.md
      data/scan-          jds.json             data/linkedin-openings.md
      history.tsv                              data/ai-scores.json

  ┌────────────────────────────────────────────────────────────────┐
  │  DOWNSTREAM TOOLS (read the leaderboards)                     │
  │                                                                │
  │  today.mjs ··········· daily briefing (4 sections)            │
  │  keywords.mjs ········ JD vs cv.md skill gap                  │
  │  referrals.mjs ······· referral targets + message drafts      │
  │  linkedin-recent.mjs · windowed LinkedIn slice                │
  │  prep.mjs ············ interview prep scaffold                │
  └────────────────────────────────────────────────────────────────┘

  Config:  config.yml          (single source of truth)
  Résumé:  cv.md               (drives skill scoring)
  Stories: data/story-bank.md  (8 STAR+R stories for prep)
```

---

## 🛠 Command Reference

### `jobhunt.mjs` — Interactive CLI

> The main entry point. Orchestrates scanning, LinkedIn discovery, and ranking.

```bash
node jobhunt.mjs
```

Interactive prompts let you choose freshness window (24h/4d/7d/14d/everything), LinkedIn scan (Y/n), and Gemini AI scores (Y/n).

**Outputs:** `data/top-openings.md` · `data/linkedin-openings.md` · `data/linkedin-recent.md`

---

<details>
<summary><strong><code>scan.mjs</code> — Board Scanner</strong></summary>

Reads companies from `config.yml`, hits their ATS APIs directly, applies title + location filters, deduplicates against history. **Zero tokens** — pure HTTP + JSON.

```bash
node scan.mjs                     # scan all enabled companies
node scan.mjs --dry-run            # preview — write nothing
node scan.mjs --company nvidia     # scan one company (substring match)
```

**How it works:**
1. Detects ATS provider from each company's `careers_url`
2. Hits public API (Greenhouse, Ashby, Lever, Workable, Workday)
3. Applies `title_filter` (positive + negative) and `location_filter`
4. Deduplicates against `data/scan-history.tsv` + `data/pipeline.md`
5. Runs 10 companies in parallel

</details>

<details>
<summary><strong><code>linkedin.mjs</code> — LinkedIn Scanner</strong></summary>

Port of the n8n "Job search ultimate workflow." Hits LinkedIn's guest search endpoint for all queries in `config.yml`.

```bash
node linkedin.mjs                  # default: last 96 hours
node linkedin.mjs --hours 48       # last 48 hours
node linkedin.mjs --dry-run        # preview — write nothing
```

**No title filter on purpose** — LinkedIn's level metadata is unreliable, so Gemini scores every job from the actual JD text.

- Paginates each query (6 pages × ~10 results)
- Fetches full JD text for new jobs (capped at `max_new_per_run`)
- Polite delays (2.5–5s jitter); backs off on rate-limit

</details>

<details>
<summary><strong><code>rank.mjs</code> — Scoring Engine</strong></summary>

Scores all openings with deterministic heuristic + optional Gemini AI.

```bash
node rank.mjs                      # heuristic only
node rank.mjs --ai                 # + Gemini AI scores (free, cached)
node rank.mjs --days 7             # only last 7 days
node rank.mjs --top 30             # apply-first table size (default: 30)
```

- Board openings → `data/top-openings.md`
- LinkedIn openings → `data/linkedin-openings.md`
- AI results cached in `data/ai-scores.json` (never re-scores)
- Batches 5 jobs per Gemini call; only scores heuristic ≥ 65 (boards) or all (LinkedIn)

</details>

<details>
<summary><strong><code>linkedin-recent.mjs</code> — Windowed LinkedIn View</strong></summary>

Filters the full LinkedIn list to your chosen freshness window. **Overwrites** `data/linkedin-recent.md` on every run.

```bash
node linkedin-recent.mjs             # last 24 hours
node linkedin-recent.mjs --days 4    # last 4 days
```

The full list stays in `data/linkedin-openings.md` — this is just the windowed slice.

</details>

<details>
<summary><strong><code>today.mjs</code> — Daily Briefing</strong></summary>

Your daily to-do in one screen.

```bash
node today.mjs                     # apply list (score ≥ 70)
node today.mjs --min 80            # raise the threshold
node today.mjs --new               # only 🆕 (posted ≤ 7 days)
```

| Section | What |
|---------|------|
| ① **Apply First** | Top openings not yet applied to |
| ② **Referral Nudges** | Contacts due for a follow-up (6/12-day cadence) |
| ③ **Follow-ups** | Applications > 7 days with no response |
| ④ **Pipeline** | Status counts from `data/applications.md` |

</details>

<details>
<summary><strong><code>keywords.mjs</code> — JD Skill Gap Analyzer</strong></summary>

Fetches a JD and shows which tech skills are missing from your `cv.md`.

```bash
node keywords.mjs <job-url>        # any supported ATS or cached LinkedIn
node keywords.mjs Notion           # company name → its top opening
```

60+ canonical tech skills with regex matching. Output:

```
✅ JD skills you already have (12): JavaScript, TypeScript, Node.js, ...
⚠️  JD skills MISSING from your résumé (3): Go, Kubernetes, Terraform
```

Supports: Greenhouse, Ashby, Lever, Workday, LinkedIn (cached).

</details>

<details>
<summary><strong><code>referrals.mjs</code> — Referral Finder</strong></summary>

Generates per-company referral worksheets with LinkedIn search URLs + message drafts.

```bash
node referrals.mjs                          # top 15 companies
node referrals.mjs --top 25                 # more companies
node referrals.mjs --min-ai 80             # high-scoring only
node referrals.mjs --followups              # who to nudge today
node referrals.mjs --email "Jane Doe" co.com  # guess email patterns
```

**Per company:** LinkedIn people-search URLs (alumni + ex-colleagues) · DM draft (≤300 chars) · Email draft with `mailto:` · Alumni tool link

**Follow-up cadence:** 1st nudge at 6 days, 2nd at 12 days, then stops.

**Email guesser:** 7 patterns ranked most → least common (always check LinkedIn "Contact info" first).

**Agency filter:** Auto-skips staffing firms (BeaconFire, SynergisticIT, etc.)

> ⚠️ You send every message yourself. No scraping, no auto-sending.

</details>

<details>
<summary><strong><code>prep.mjs</code> — Interview Prep Scaffold</strong></summary>

Zero-token interview prep mapped to your story bank.

```bash
node prep.mjs Notion
node prep.mjs "Hudson River Trading"
```

**Generates `interview-prep/{company}.md`:**
1. Role details from leaderboard (title, URL, fit score)
2. 9 question buckets × your STAR+R stories mapping table
3. Technical checklist (DSA, architecture, numbers, reverse questions)
4. F-1/OPT sponsorship talking points

For the deep version → `claude → "prep me for Notion"`

</details>

<details>
<summary><strong>People Grabber Bookmarklet</strong></summary>

Browser bookmarklet that copies people from a LinkedIn search page into a clean table (Name, Headline, URL).

**Install:** Add a bookmark with `bookmarklet.txt` contents as the URL.

**Use:** Run a LinkedIn People search → scroll → click bookmark → paste.

**Rebuild:** `node make-bookmarklet.mjs` (if LinkedIn changes page structure)

</details>

---

## 📊 Scoring System

### Heuristic Score — deterministic, 0–100

<details>
<summary><strong>Full point breakdown</strong></summary>

| Factor | Points | Details |
|--------|:------:|---------|
| Base | 30 | Starting score |
| **Company tier** | +5 to +14 | Tier 1 = +14 · Tier 2 = +9 · Tier 3 = +5 |
| **Title: new-grad/intern** | +16 to +20 | "New Grad", "Entry Level", "Engineer I", "Intern" |
| **Title: role type** | -4 to +10 | Backend/Full-Stack +10 · AI/ML +7 · Platform +5 · Frontend -4 · QA -8 |
| **Title: non-engineer** | -20 | Missing engineer/developer/swe/sde/intern |
| **Location: NYC** | +12 | NY / Hoboken / Jersey City / Brooklyn |
| **Location: Remote** | +8 | |
| **Location: SF/SEA/BOS** | +6 | |
| **Skill overlap** | up to +18 | Expert skills +2 ea (cap 12) · Strong +1 ea (cap 6) |
| **Experience: 5+ yr ask** | -25 | + ⏳ flag |
| **Experience: 3+ yr ask** | -12 | + ⏳ flag |
| **New-grad JD language** | +6 | "new grad", "recent graduate", "no prior experience" |
| **Sponsorship: negative** | -35 | "unable to sponsor", "citizenship required" → ⚠️ |
| **Sponsorship: positive** | +5 | "we sponsor", "H-1B", "OPT" → ✅ |
| **Salary** | +2 to +4 | Based on posted range |
| **Fresh (≤7 days)** | +4 | → 🆕 |
| **Fresh (≤14 days)** | +2 | |
| **Stale (180+ days)** | -6 | → 📅 evergreen |

</details>

### AI Score — Gemini, 0–100

| Component | Weight |
|-----------|:------:|
| Skills overlap (languages, DSA, distributed systems, cloud) | 40 |
| Relevant experience (internships, TA, projects) | 25 |
| Responsibilities alignment (junior/entry tasks) | 15 |
| Education fit (MS students / recent grads) | 10 |
| Domain/industry fit | 5 |
| Logistics | 5 |

> **Critical deductions:** -30 if role requires 3+ years or is mid/senior · -40 if JD says no visa sponsorship

### Signal Flags

| Flag | Meaning | Action |
|:----:|---------|--------|
| 🎓 | New-grad or intern title | High priority |
| 🗽 | NYC-area location | Preferred metro |
| ✅ | Sponsors visas | Safe to apply |
| ⚠️ | No sponsorship / citizenship | **Skip** |
| 🆕 | Posted ≤ 7 days | **Apply same day** |
| ⏳ | Asks 3+ years experience | Stretch role |
| 📅 | 180+ days old | Likely evergreen |
| 💬 | Gemini's one-line reason | Read for context |

---

## ⚙️ Configuration

### `config.yml` — single source of truth

<details>
<summary><strong>Full structure</strong></summary>

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

companies:
  - { name: Stripe, careers_url: https://job-boards.greenhouse.io/stripe, tier: 1 }
  - { name: OpenAI, careers_url: https://jobs.ashbyhq.com/openai, tier: 1 }
```

</details>

### Adding a Company

```yaml
- name: Acme Corp
  careers_url: https://job-boards.greenhouse.io/acmecorp   # provider auto-detected
  tier: 2
  notes: NYC office, Node-heavy backend team
```

### Disabling a Company (manual-check only)

```yaml
- name: Google
  enabled: false
  careers_url: https://www.google.com/about/careers/...
  tier: 1
  notes: Custom ATS — check manually; seen via LinkedIn scan
```

---

## 📁 Data Files

| File | Purpose | Generated By |
|------|---------|:------------:|
| `data/pipeline.md` | All board openings (checklist) | `scan.mjs` |
| `data/scan-history.tsv` | Dedup ledger (URL, date, provider, title) | `scan.mjs` · `linkedin.mjs` |
| `data/top-openings.md` | **Board leaderboard** — ranked, dual-scored | `rank.mjs` |
| `data/linkedin-openings.md` | **LinkedIn leaderboard** — full, AI-scored | `rank.mjs` |
| `data/linkedin-recent.md` | LinkedIn windowed slice (replaced each run) | `linkedin-recent.mjs` |
| `data/linkedin-jds.json` | LinkedIn JD text cache | `linkedin.mjs` |
| `data/ai-scores.json` | Gemini score cache (keyed by URL) | `rank.mjs` |
| `data/story-bank.md` | 8 STAR+R interview stories | Manual |
| `data/applications.md` | Application tracker | Manual |
| `data/referral-targets.md` | Referral worksheet (search links + drafts) | `referrals.mjs` |
| `data/referrals.md` | Outreach tracker (contacts + status) | Manual |
| `interview-prep/{company}.md` | Interview prep scaffold | `prep.mjs` |

---

## 🔌 Supported ATS Providers

| Provider | URL Pattern | API |
|----------|-------------|-----|
| **Greenhouse** | `job-boards.greenhouse.io/{slug}` | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| **Ashby** | `jobs.ashbyhq.com/{slug}` | `api.ashbyhq.com/posting-api/job-board/{slug}` |
| **Lever** | `jobs.lever.co/{slug}` | `api.lever.co/v0/postings/{slug}` |
| **Workable** | `apply.workable.com/{slug}` | `apply.workable.com/{slug}/jobs.md` |
| **Workday** | `{tenant}.wd{N}.myworkdayjobs.com/{site}` | CXS POST API with targeted search |

> Companies with custom ATS (Google, Meta, Amazon, Apple, Netflix, Microsoft) are `enabled: false` — included as bookmark URLs and surface via LinkedIn.

---

## 🏢 Company Coverage

**90+ verified companies** across these categories:

<details>
<summary><strong>Full company list</strong></summary>

| Category | Companies |
|----------|-----------|
| **FAANG+** | Google · Meta · Amazon · Apple · Netflix · Microsoft · NVIDIA |
| **Top-Tier Tech** | Stripe · Plaid · Datadog · MongoDB · Snowflake · Databricks · Cloudflare · Airbnb · Uber |
| **AI / ML** | Anthropic · OpenAI · Scale AI · Hugging Face · Cursor · Sierra · ElevenLabs · Replit · xAI |
| **Dev Tools** | Figma · Notion · Vercel · Linear · GitHub · GitLab · Supabase · PostHog |
| **Fintech** | Block · Robinhood · Ramp · Brex · Coinbase · SoFi · Chime · Betterment · Affirm · Mercury |
| **Trading** | Hudson River Trading · IMC · Akuna Capital · Jump Trading · Squarepoint · DRW |
| **Consumer** | DoorDash · Discord · Reddit · Spotify · Pinterest · Lyft · Instacart · Squarespace |
| **Enterprise** | Salesforce · Adobe · ServiceNow · Workday · Capital One · Mastercard · Atlassian |
| **Infrastructure** | Temporal · Cockroach Labs · Modal · Render · Confluent · Elastic · Samsara |

</details>

---

## 🤖 AI Agent Integration

`AGENTS.md` contains detailed instructions for AI coding assistants (Claude Code, Gemini CLI):

| Command | What the Agent Does |
|---------|-------------------|
| **`evaluate top N`** | Fetches each posting → `reports/{n}-{company}.md` with X.X/5 score, fit table, gaps, comp research, ghost-job check |
| **`prep me for {company}`** | Deep interview prep: process research, audience-mapped rounds, story mapping, technical checklist |
| **`draft outreach to {person}`** | 3-sentence referral message adapted to recruiter / HM / peer engineer |

> These are natural-language instructions the AI follows. Run them inside `claude` or `gemini` in the project directory.

---

## ⚠️ Honest Caveats

| Caveat | Details |
|--------|---------|
| **LinkedIn ToS** | Scraping is unofficial and against ToS. Isolated in `linkedin.mjs` so the board scanner never depends on it. Personal use, low volume, polite delays. |
| **Scores ≠ truth** | High score = "read this posting." ⚠️ = check sponsorship yourself. When AI and heuristic diverge, that's signal — look at both. |
| **No auto-anything** | Discovery + ranking + drafting only. Applying, networking, and interviewing are yours. |
| **Email guesses** | Always check LinkedIn "Contact info" first. Guessed patterns are guesses. |
| **FAANG custom ATS** | Google, Meta, Amazon, Apple, Netflix, Microsoft can't be API-scanned. Bookmark URLs + LinkedIn discovery. |

---

## 🧑‍💻 Customize for Your Profile

This tool is designed to be forked and personalized. **No code changes needed** — everything is driven by config files.

### Step 1 · Fork & Clone

```bash
# Fork this repo on GitHub, then:
git clone https://github.com/<your-username>/jobHunt.git
cd jobHunt
npm install
```

### Step 2 · Replace the Profile

Open `config.yml` and replace the entire `profile:` section with your details:

```yaml
profile:
  name: Your Name
  email: you@university.edu
  location: Your City, State
  linkedin: https://www.linkedin.com/in/you
  github: https://github.com/you

  education:
    current: MS Computer Science, Your University (2024 – 2026)
    gpa: 3.8 / 4.00

  work_authorization:
    status: F-1 student, OPT eligible May 2026   # or: US Citizen, Green Card, etc.
    sponsorship_required: true                     # set false if you don't need sponsorship

  target_roles:
    primary:
      - Backend Engineer (New Grad)
      - Full-Stack Engineer (New Grad)
    secondary:
      - AI/ML Engineer (entry-level)

  core_stack:
    expert: [Python, Django, PostgreSQL]           # your strongest skills
    strong: [Docker, AWS, Redis]                   # confident with
    working: [Go, Kubernetes, GraphQL]             # familiar, learning

  comp_expectations:
    base_min: 100000
    base_target: 130000
```

> **If you don't need sponsorship:** set `sponsorship_required: false`. The ⚠️ no-sponsor flag will still show (useful info), but the -35 heuristic penalty won't matter to you.

### Step 3 · Replace Your Résumé

Overwrite `cv.md` with your résumé in markdown. The scorer compares JD skills against this file word-by-word, so:

- ✅ List every technology you can honestly claim (even minor ones)
- ✅ Use canonical names (`PostgreSQL` not just `Postgres`, `Kubernetes` not just `k8s`)
- ❌ Don't pad — the AI scorer reads the JD and will judge real fit

### Step 4 · Customize Companies

Edit the `companies:` list in `config.yml`. For each company you care about:

```yaml
companies:
  - name: Stripe
    careers_url: https://job-boards.greenhouse.io/stripe   # provider auto-detected from URL
    tier: 1          # 1 = dream, 2 = strong, 3 = apply if role fits
    notes: NYC office, sponsors H-1B

  # To add a company: find their careers page URL.
  # Supported patterns:
  #   Greenhouse  → https://job-boards.greenhouse.io/{slug}
  #   Ashby       → https://jobs.ashbyhq.com/{slug}
  #   Lever       → https://jobs.lever.co/{slug}
  #   Workable    → https://apply.workable.com/{slug}
  #   Workday     → https://{tenant}.wd{N}.myworkdayjobs.com/{site}

  # Companies with custom ATS (Google, Meta, etc.):
  - name: Google
    enabled: false                    # won't be scanned, but bookmarked
    careers_url: https://www.google.com/about/careers/...
    tier: 1
```

### Step 5 · Tune Filters

Adjust `title_filter` and `location_filter` to match your targets:

```yaml
title_filter:
  positive:                    # at least one must match
    - Software Engineer
    - Backend
    - New Grad
    - Intern
  negative:                    # any match = skip
    - Senior
    - Staff
    - Lead
    - Manager

location_filter:
  always_allow:                # always pass, even if nothing else matches
    - United States
    - Remote
  block:                       # always reject
    - India
    - United Kingdom
    # Remove countries you'd consider working in
```

### Step 6 · Write Your Story Bank

Replace `data/story-bank.md` with your own STAR+R stories. Keep ~6-8 stories grounded in **real projects**:

```markdown
### [Impact / Ownership] Your Project Name
**Source:** Project or Internship name
**S:** The situation...
**T:** What you needed to do...
**A:** What you actually did (specific tech, specific decisions)...
**R:** The measurable result...
**Reflection:** What you learned...
**Best for questions about:** ownership, system design, ...
```

> The `prep.mjs` scaffold maps these stories to interview question buckets — it uses the `**Best for questions about:**` line to match.

### Step 7 · Update LinkedIn Queries

Customize `linkedin.queries` for your target roles and locations:

```yaml
linkedin:
  max_new_per_run: 150
  pages: 6
  queries:
    - { keywords: Software Engineer, location: United States }
    - { keywords: Data Engineer, location: San Francisco }     # your roles
    - { keywords: ML Engineer New Grad, location: United States }
```

### Step 8 · Update Agent Instructions (Optional)

If you use Claude Code or Gemini CLI, edit `AGENTS.md` to reflect your profile — the AI agent reads this file for context when you say `evaluate top 3` or `prep me for Notion`.

### Step 9 · Clear Existing Data & Run

```bash
# Remove the previous user's scan data
rm -rf data/*.json data/*.tsv data/*.md
mkdir -p data

# Initialize empty trackers
echo '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | Notes |\n|---|------|---------|------|-------|--------|-------|' > data/applications.md
echo '# Referral Outreach Tracker\n\n| Date | Company | Person | Role | Channel | Status | Follow-up due |\n|------|---------|--------|------|---------|--------|---------------|' > data/referrals.md

# Write your story bank
# (edit data/story-bank.md with your own stories)

# First run!
node jobhunt.mjs
```

### Quick Checklist

| Step | File | What to Change |
|:----:|------|---------------|
| 1 | — | Fork & clone |
| 2 | `config.yml` → `profile:` | Name, contact, education, skills, target roles, comp |
| 3 | `cv.md` | Your full résumé in markdown |
| 4 | `config.yml` → `companies:` | Add/remove companies, set tiers |
| 5 | `config.yml` → `title_filter:` / `location_filter:` | Your role keywords, blocked locations |
| 6 | `data/story-bank.md` | Your STAR+R interview stories |
| 7 | `config.yml` → `linkedin:` | Your search queries and locations |
| 8 | `AGENTS.md` | Your profile context for AI agents (optional) |
| 9 | `data/*` | Clear previous data, run fresh |

> **Zero code changes.** If something doesn't fit, it's probably in `config.yml`.

---

## 🧰 Tech Stack

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js ≥ 18 (ESM modules, native `fetch`) |
| Dependencies | **1** — `js-yaml` |
| AI | Google Gemini CLI (optional, free tier) |
| Data | Markdown tables · JSON caches · TSV history |
| Config | YAML (single file) |

---

<div align="center">

**Built for one person's job search. Fork it, make it yours.**

Made with ☕ and too many `node_modules` regrets

</div>
