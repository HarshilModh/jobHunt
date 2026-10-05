<div align="center">

# 🔎 jobhunt

**CLI-first job search toolkit that scans 90+ company boards & LinkedIn,<br>dual-scores every opening against your résumé, and finds referral paths.**

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
[![Dependencies](https://img.shields.io/badge/deps-2%20(express%2C%20js--yaml)-blue?style=flat-square)](package.json)
[![UI](https://img.shields.io/badge/UI-Local%20Web%20Dashboard-00d4ff?style=flat-square)](#-web-dashboard)
[![AI](https://img.shields.io/badge/AI-Gemini%20Free%20Tier-8E75B2?style=flat-square&logo=google&logoColor=white)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/license-personal--use-lightgrey?style=flat-square)](#license)

`No CV generation` · `No auto-apply` · `No bloat` · `CLI + Web Dashboard` · `One config`

---

</div>

## ⚡ Quick Start

```bash
git clone https://github.com/HarshilModh/jobHunt.git
cd jobHunt
npm install                                    # dependencies (express, js-yaml)
npm i -g @google/gemini-cli && gemini          # optional: free AI scoring (log in once)
```

> **Two files to edit before your first run:**
> - **`config.yml`** — your profile, target companies, filters (single source of truth)
> - **`cv.md`** — your résumé in markdown (drives skill scoring)

```bash
node jobhunt.mjs     # → pick "Everything" → scan + LinkedIn + rank → done
npm start            # → optional web dashboard at http://localhost:3005 (see below)
```

---

## 📋 Table of Contents

<details>
<summary><strong>Click to expand</strong></summary>

- [Why This Exists](#-why-this-exists)
- [Quick Start](#-quick-start)
- [Daily Workflow](#-daily-workflow)
- [Web Dashboard](#-web-dashboard)
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
- [Customize for Your Profile](#-customize-for-your-profile)
- [Tech Stack](#-tech-stack)

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
│     OR npm start             browser workstation UI        │
│  ② node today.mjs            one-screen daily briefing     │
│  ③ Apply to top matches      🎓 + ✅ + 🆕 = highest priority│
│                                                            │
├─ BEFORE APPLYING ──────────────────────────────────────────┤
│                                                            │
│  ④ node keywords.mjs <url>   check skill gaps for a JD    │
│  ⑤ node liveness.mjs <url>   verify posting is still live │
│                                                            │
├─ NETWORKING ───────────────────────────────────────────────┤
│                                                            │
│  ⑥ node referrals.mjs        search links + message drafts│
│  ⑦ node referrals.mjs --followups   who to nudge today    │
│                                                            │
├─ INTERVIEW PREP ──────────────────────────────────────────┤
│                                                            │
│  ⑧ node dsa.mjs <company>    most-asked LeetCode problems  │
│  ⑨ node prep.mjs <company>   zero-token scaffold          │
│  ⑩ claude/gemini → "prep me" deep version (web research)  │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### Reading the Leaderboard

For daily applications, open `data/ats-recent.md`, `data/aggregator-recent.md`, and `data/linkedin-recent.md`—or browse them in the [web dashboard](#-web-dashboard). The corresponding `*-openings.md` files are complete archives, not freshness views.

| # | AI | Score | Company | Role | Posted | Signals |
|---|:--:|:-----:|---------|------|--------|---------|
| 1 | **88** | 76 | Stripe | Software Engineer, New Grad | 2d | 🎓 ✅ 🆕 |
| 2 | **82** | 71 | Datadog | SWE I — Backend | 5d | 🎓 🗽 |
| 3 | — | 68 | Ramp | Backend Engineer | 1d | 🆕 |

> **AI** = Gemini full-JD score (lead with this) · **Score** = deterministic heuristic (cross-check) · **Signals** = at-a-glance flags

**Priority:** High AI + 🎓 + ✅ + 🆕 → apply same day. Skip ⚠️ no-sponsor.

---

## 🖥 Web Dashboard

A local browser UI over the same data the CLI produces — no separate setup, no separate data.

```bash
npm start                 # → http://localhost:3005
```

Bound to `127.0.0.1` only (not reachable from other machines on your network). Opens your browser automatically — set `JOBHUNT_NO_OPEN=1 npm start` to skip that (e.g. over SSH). Custom port: `PORT=4000 npm start`.

| Tab | What it does |
|-----|---------------|
| **Leaderboard** | All openings (ATS + aggregators + LinkedIn + Indeed + pipeline inbox + LinkedIn Recent) in one sortable, filterable, 60 FPS paginated table. Quick Scan toggles (`Visa Friendly` / `New Grad`), list switcher pills, search, JobRight match reasoning callouts, and one-click **Apply** (opens posting + logs to tracker). |
| **Tracker** | `data/applications.md` as a live table — change status inline, add applications by hand. |
| **Referrals** | Pick a target (recruiter / hiring manager / peer), fill in name/company/role, generate a ready-to-send outreach draft. |
| **Interview Prep** | Browse every `interview-prep/{company}.md` file and your `data/story-bank.md` STAR+R stories. |
| **Workstation** | Run `scan.mjs` / `aggregators.mjs` / `rank.mjs` / `today.mjs` / `liveness.mjs` from a button, with live streamed console output — no terminal needed. |
| **Setup & Docs** | Built-in interactive help center & documentation — 3-step quick setup, CLI cheat sheet, workflows overview, and F-1/OPT sponsorship rules. |

The dashboard only *reads and appends to* the same `data/*.md` / `data/*.json` files the CLI uses — running `node jobhunt.mjs` and refreshing the dashboard (or running tasks inside the **Workstation**) both work seamlessly and stay in sync.


---

## 🎯 Features at a Glance

<table>
<tr>
<td width="50%">

### 📡 Discovery
- **Board scanner** — 90+ ATS APIs in parallel (zero tokens)
- **Aggregators** — SimplifyJobs + speedyapply new-grad & intern feeds (beyond the company list)
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
     │ scan.mjs + agg │  │  linkedin.mjs   │  │    rank.mjs     │
     │ ATS + Simplify │  │ guest endpoint  │  │ heuristic + AI  │
     │ board-store    │  │ 13+ queries     │  │ dual scoring    │
     └───────┬────────┘  └───────┬─────────┘  └───────┬─────────┘
             │                   │                     │
             ▼                   ▼                     ▼
      data/pipeline.md    data/linkedin-       data/ats-openings.md
      data/board-jobs.    jds.json             data/aggregator-openings.md
      json + scan-hist                         data/linkedin-openings.md
                                               data/ai-scores.json

  ┌────────────────────────────────────────────────────────────────┐
  │  INDEED LANE (Claude Code / Antigravity MCP connector)         │
  │                                                                │
  │  indeed skill → Indeed MCP → indeed.mjs --import               │
  │  → data/indeed-jds.json → rank.mjs → data/indeed-openings.md   │
  └────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │  DECISION VIEWS (rolling windowed & deduplicated slices)       │
  │                                                                │
  │  board-recent.mjs ───► data/ats-recent.md, aggregator-recent.md│
  │  linkedin-recent.mjs ─► data/linkedin-recent.md                │
  └────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │  DOWNSTREAM TOOLS (read the leaderboards)                     │
  │                                                                │
  │  today.mjs ··········· daily briefing (4 sections)            │
  │  keywords.mjs ········ JD vs cv.md skill gap                  │
  │  liveness.mjs ········ posting live / closed verification     │
  │  referrals.mjs ······· referral targets + message drafts      │
  │  dsa.mjs ············· company LeetCode problem frequency     │
  │  prep.mjs ············ interview prep scaffold                │
  └────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────┐
  │  WEB DASHBOARD (server.mjs → http://localhost:3005)            │
  │                                                                │
  │  Leaderboard · Live Tracker · Referrals · Prep · Workstation   │
  └────────────────────────────────────────────────────────────────┘

  Config:  config.yml          (single source of truth)
  Résumé:  cv.md               (drives skill scoring)
  Stories: data/story-bank.md  (8 STAR+R stories for prep)
```

---

## 🛠 Command Reference

> Shortcuts: `npm run hunt` / `scan` / `aggregators` / `rank` / `rank:ai` / `recent` / `today` / `referrals` / `liveness` map to the `node *.mjs` commands below — use either. Run `npm start` for the web dashboard.

### `jobhunt.mjs` — Interactive CLI

> The main entry point. Orchestrates scanning, LinkedIn discovery, and ranking.

```bash
node jobhunt.mjs
```

Interactive prompts let you choose freshness window (24h/4d/7d/14d/everything), LinkedIn scan (Y/n), and Gemini AI scores (Y/n).

**Decision views:** `data/ats-recent.md` · `data/aggregator-recent.md` · `data/linkedin-recent.md`
**Complete archives:** `data/ats-openings.md` · `data/aggregator-openings.md` · `data/linkedin-openings.md` · `data/indeed-openings.md` (when `/indeed` has been run)

The selected freshness window is passed to both aggregator discovery and AI-scoring. A run lock prevents accidentally starting a second pipeline while the first is still active.

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
3. Applies `title_filter` (positive + negative) and `location_filter` — shared with
   every other lane via `board-store.mjs`, so one config edit changes them all. Negative
   terms match whole words and are ignored inside a matched positive phrase, so
   `Member of Technical Staff` survives the `Staff` negative while
   `Staff Software Engineer` does not
4. Saves native posting time/JD text when the provider exposes them
5. Canonicalizes Workday/Greenhouse/Ashby/Lever/Amazon URLs and deduplicates under a writer lock
6. Preserves exact discovery/last-seen timestamps in `data/board-jobs.json`
7. Runs 10 companies in parallel

</details>

<details>
<summary><strong><code>aggregators.mjs</code> — Open-Ended Aggregators</strong></summary>

`scan.mjs` only checks companies in `config.yml`. This pulls community feeds (**SimplifyJobs**, **speedyapply**, Jobright and others), applies the **same** discovery filters, canonical-dedups, and preserves each feed's posting date and sponsorship metadata in `data/board-jobs.json`. **Zero tokens.** Jobright remains enabled for breadth but its rows are quarantined by source/URL and lose to a direct employer copy.

**Adding a source** — under `aggregators.sources:` in `config.yml`:
- **JSON feeds** (SimplifyJobs schema: `url`, `title`, `company_name`, `locations`, `date_posted`, `sponsorship`, `active`) — just add the raw URL.
- **Markdown README tables** (e.g. speedyapply) — add `format: markdown`. A header-driven parser maps the `Company` / `Position`(or `Role`/`Title`) / `Location` / `Posting`(or `Apply`) / `Age`(or `Posted`/`Date`) columns into the same listing shape, so they rank identically. Date cells understand `17d`, `1 day ago`, `Today`, ISO dates, and `Jun 22`.

> Check the feed is still **actively maintained** before adding it — repo commit activity ≠ data freshness, and a repo's `jobs.json` can be a stale artifact while its README is live. Verify the newest **posting date** in whatever file you point at, not the last push.

```bash
node aggregators.mjs                 # all enabled sources, last 30 days
node aggregators.mjs --days 7        # only postings from the last 7 days
node aggregators.mjs --days 0        # no date filter (every active listing)
node aggregators.mjs --dry-run       # preview — write nothing
node aggregators.mjs --source intern # one source (substring match on id)
```

**F-1 aware:** each listing's `sponsorship` field is persisted — `"U.S. Citizenship is Required"` postings are dropped (ineligible), while explicit no-sponsorship roles remain archived but are forced to Skip.

Configure sources / window in `config.yml` under `aggregators:`.

</details>

<details>
<summary><strong><code>linkedin.mjs</code> — LinkedIn Scanner</strong></summary>

Port of the n8n "Job search ultimate workflow." Hits LinkedIn's guest search endpoint for all queries in `config.yml`.

```bash
node linkedin.mjs                  # incremental since last successful scan (+ overlap)
node linkedin.mjs --hours 48       # explicit manual 48-hour scan
node linkedin.mjs --force          # bypass the frequent-run cooldown
node linkedin.mjs --dry-run        # preview — write nothing
```

**No title filter on purpose** — LinkedIn's level metadata is unreliable, so Gemini scores every job from the actual JD text.

- First run searches 24 hours; later runs search since the last success plus a one-hour overlap
- Runs each query unfiltered, then again with Internship + Entry level + Associate filters; URL dedup keeps one archive record
- Archives every discovered card; `max_new_per_run` caps JD detail fetches, not discovery
- A run discovers far more cards than the JD budget describes, so the fetch queue is ordered
  by `title_filter` fit (freshness breaks ties), not by recency alone — the undescribed
  remainder is the junk tail rather than whatever happened to be oldest
- Skips JD fetches for reposts of a role already described, known reposters, and anything
  older than `detail_max_age_days`
- Paginates up to `max_pages` and stops after consecutive pages with nothing this run
  hasn't already seen
- Saves exact discovery time and the most precise posting time LinkedIn exposes
  (a re-observed card never overwrites a sharper timestamp with a coarser one)
- Records which search mode first surfaced each card, so the second pass's cost is measurable
- Uses a 90-minute cooldown by default, making 4–5 daily pipeline runs safe
- Polite delays (2.5–5s jitter); backs off on rate-limit

</details>

<details>
<summary><strong><code>indeed.mjs</code> + <code>/indeed</code> — Indeed Scanner (Claude Code)</strong></summary>

Indeed blocks plain-Node scraping (Cloudflare 403) and killed its RSS feed, so this lane fetches through the **Indeed MCP connector** inside Claude Code.

```bash
claude                              # then type: /indeed
node indeed.mjs --import jobs.json  # (what the skill runs for you)
node indeed.mjs --import jobs.json --dry-run
```

**Prerequisite:** enable the Indeed connector (claude.ai → Settings → Connectors).

- `/indeed` reads `config.yml → indeed.queries`, searches via MCP, filters by `title_filter` / `location_filter` / `company_blocklist` (hard exclude — same filters as `scan.mjs`/`aggregators.mjs`) and dedups against `scan-history.tsv` *before* fetching JDs, then hands a JSON to `indeed.mjs`
- `indeed.mjs` re-enforces the same filters + dedup authoritatively, then owns all writes: `data/indeed-jds.json` + `scan-history.tsv` (portal `indeed`); never touches `pipeline.md`
- Unlike LinkedIn, Indeed **is** title/location/blocklist-filtered — its MCP connector returns a fixed ~10 results/query with no pagination, so noise is too costly to leave for Gemini to sort out after the fact. Survivors still get Gemini-judged for experience-level/sponsorship fit
- Bonus over LinkedIn: Indeed results include posted **salary**, which flows into the leaderboard's Salary column

</details>

<details>
<summary><strong><code>rank.mjs</code> — Scoring Engine</strong></summary>

Scores all openings with deterministic heuristic + optional Gemini AI.

```bash
node rank.mjs                      # heuristic only
node rank.mjs --ai                 # + Gemini AI scores (free, cached)
node rank.mjs --days 7             # AI-score the 7-day decision window; archives stay complete
node rank.mjs --top 30             # apply-first table size (default: 30)
```

- ATS complete archive → `data/ats-openings.md` + `data/ats-ranked.json`
- Aggregator complete archive → `data/aggregator-openings.md` + `data/aggregator-ranked.json`
- LinkedIn openings → `data/linkedin-openings.md`
- Structured LinkedIn ranking → `data/linkedin-ranked.json`
- Indeed openings → `data/indeed-openings.md`
- AI results cached in `data/ai-scores.json`; cached scores remain visible only while JD text is available
- Batches 5 jobs per Gemini call; only scores heuristic ≥ 65 (boards) or all (LinkedIn)
- Canonical duplicates are removed before scoring; broad-discovery non-SWE titles, 2027 cohorts, no-sponsor roles and reposter sources receive hard decisions before rendering

</details>

<details>
<summary><strong><code>board-recent.mjs</code> — ATS + Aggregator Windowed Views</strong></summary>

Builds the accurate decision views from the structured ATS/aggregator archives.

```bash
node board-recent.mjs --days 1      # rolling 24 hours
node board-recent.mjs --days 4      # four-day view
npm run recent                      # rolling 24 hours
```

Exact provider timestamps use a true rolling cutoff. Date-only timestamps are marked `≈`; jobs with no native posting time are labeled `found … (posted unknown)` rather than falsely called newly posted. Direct employer URLs beat Jobright/reposter copies, and duplicate suppression never deletes archive records.

</details>

<details>
<summary><strong><code>linkedin-recent.mjs</code> — Windowed LinkedIn View</strong></summary>

Builds an eligibility-aware decision view from the structured LinkedIn archive. The normal pipeline always uses a rolling 24-hour window and **overwrites** `data/linkedin-recent.md` on every run.

```bash
node linkedin-recent.mjs             # last 24 hours
node linkedin-recent.mjs --days 4    # last 4 days
```

The view leads with AI fit, keeps the heuristic beside it, applies hard F-1/OPT and level gates, separates Apply/Review/Skip/Quarantine, and suppresses semantic duplicates. Date-only LinkedIn timestamps are labeled approximate. Every suppressed or skipped record remains in the full archive.

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
<summary><strong><code>liveness.mjs</code> — Posting Liveness Checker</strong></summary>

Checks whether a posting is still live or closed by verifying directly against the source ATS API or page (Greenhouse, Ashby, Lever, Workday, LinkedIn). **Zero tokens.**

```bash
node liveness.mjs <url>          # check one posting → live / closed / unknown
node liveness.mjs --top 20       # check the top 20 of each leaderboard → data/liveness-report.md
npm run liveness                 # shortcut for top openings
```

- Returns `live` (accepting applications), `closed` (404 / no longer accepting), or `unknown`
- Protects against applying to or chasing referrals for dead/ghost postings
- When run with `--top N`, writes a full summary report to `data/liveness-report.md`

</details>

<details>
<summary><strong><code>dsa.mjs</code> — Company LeetCode Frequency</strong></summary>

Pulls company-wise LeetCode question frequency from a community mirror and writes a ranked study list to `data/dsa-{company}.md`. **Zero tokens.**

```bash
node dsa.mjs Stripe
node dsa.mjs "Hudson River Trading" --window all   # 30d | 3m | 6m | more | all (default: 6m)
node dsa.mjs Datadog --top 40
```

- Shows problem name, difficulty, frequency, acceptance rate, and LeetCode link
- Helps focus coding prep on the exact patterns and problems a company historically favors
- Used by the AI prep workflow to weight DSA recommendations

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
  negative: [Senior, Staff, Lead, Principal, Manager, ...]   # whole-word match

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
| `data/scan-history.tsv` | Dedup ledger (URL, date, provider, title) | `scan.mjs` · `linkedin.mjs` · `indeed.mjs` |
| `data/board-jobs.json` | Structured ATS/aggregator source metadata: posted/discovered/last-seen/JD/sponsorship | `scan.mjs` · `aggregators.mjs` |
| `data/ats-openings.md` | **ATS complete scored archive** | `rank.mjs` |
| `data/ats-ranked.json` | Structured ATS ranking used by the recent view | `rank.mjs` |
| `data/ats-recent.md` | Deduplicated ATS Apply/Review/Skip view (replaced each run) | `board-recent.mjs` |
| `data/aggregator-openings.md` | **Aggregator complete scored archive** | `rank.mjs` |
| `data/aggregator-ranked.json` | Structured aggregator ranking used by the recent view | `rank.mjs` |
| `data/aggregator-recent.md` | Deduplicated aggregator Apply/Review/Skip view (replaced each run) | `board-recent.mjs` |
| `data/linkedin-openings.md` | **LinkedIn scored archive** — every retained discovery | `rank.mjs` |
| `data/linkedin-ranked.json` | Structured LinkedIn ranking used by the recent view | `rank.mjs` |
| `data/linkedin-recent.md` | 24-hour deduplicated Apply/Review/Skip view (replaced each run) | `linkedin-recent.mjs` |
| `data/linkedin-jds.json` | Permanent raw LinkedIn discovery + JD archive | `linkedin.mjs` |
| `data/linkedin-scan-state.json` | Last successful incremental scan metadata | `linkedin.mjs` |
| `data/indeed-openings.md` | **Indeed leaderboard** — full, AI-scored | `rank.mjs` |
| `data/indeed-jds.json` | Indeed JD text cache (+ salary) | `indeed.mjs` (via `/indeed`) |
| `data/ai-scores.json` | Gemini score cache (keyed by URL) | `rank.mjs` |
| `data/story-bank.md` | 8 STAR+R interview stories | Manual |
| `data/applications.md` | Application tracker | Manual |
| `data/referral-targets.md` | Referral worksheet (search links + drafts) | `referrals.mjs` |
| `data/referrals.md` | Outreach tracker (contacts + status) | Manual |
| `data/liveness-report.md` | Liveness verification report (live vs closed) | `liveness.mjs` |
| `data/dsa-{company}.md` | Company-specific LeetCode frequency list | `dsa.mjs` |
| `interview-prep/{company}.md` | Interview prep scaffold | `prep.mjs` · AI Agent |
| `reports/{n}-{company}.md` | Role fit & ghost-job legitimacy evaluation reports | AI Agent (`evaluate top N`) |

---

## 🔌 Supported ATS Providers

| Provider | URL Pattern | API |
|----------|-------------|-----|
| **Greenhouse** | `job-boards.greenhouse.io/{slug}` | `boards-api.greenhouse.io/v1/boards/{slug}/jobs` |
| **Ashby** | `jobs.ashbyhq.com/{slug}` | `api.ashbyhq.com/posting-api/job-board/{slug}` |
| **Lever** | `jobs.lever.co/{slug}` | `api.lever.co/v0/postings/{slug}` |
| **Workable** | `apply.workable.com/{slug}` | `apply.workable.com/{slug}/jobs.md` |
| **Workday** | `{tenant}.wd{N}.myworkdayjobs.com/{site}` | CXS POST API with targeted search |
| **Amazon** | `amazon.jobs` | `amazon.jobs/en/search.json` with targeted new-grad/intern search terms |

> Companies with custom ATS (Google, Meta, Apple, Netflix, Microsoft) are `enabled: false` — included as bookmark URLs and surface via LinkedIn. **Amazon is now API-scannable** via its `search.json` endpoint.

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
| **FAANG custom ATS** | Google, Meta, Apple, Netflix, Microsoft can't be API-scanned. Bookmark URLs + LinkedIn discovery. (Amazon *is* scanned via `search.json`.) |

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
| Dependencies | **2** — `express`, `js-yaml` |
| Web UI | Express + Vanilla HTML5/CSS3/ES6+ (no build step, 60 FPS) |
| AI | Google Gemini CLI (optional, free tier) |
| Data | Markdown tables · JSON caches · TSV history |
| Config | YAML (single file) |

---

<div align="center">

**Built for one person's job search. Fork it, make it yours.**

Made with ☕ and too many `node_modules` regrets

</div>
