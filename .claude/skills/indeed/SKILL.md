---
name: indeed
description: Scan Indeed via the Indeed MCP connector and import new jobs into the jobhunt pipeline (data/indeed-jds.json + scan-history.tsv, ranked by rank.mjs into data/indeed-openings.md). Use when the user asks to scan/refresh Indeed jobs.
---

# Indeed scan

Indeed blocks plain-Node scraping (Cloudflare 403), so this scan fetches through
the **Indeed MCP connector** and hands results to `node indeed.mjs --import`,
which owns all file writes (dedup, JD cache, scan history). Follow these steps
exactly so every session behaves identically.

Unlike the LinkedIn lane, Indeed results ARE hard-filtered before any
`get_job_details` call — the connector returns a fixed ~10 results/query with
no pagination, so noise (irrelevant industries, gig-work reposters like
DataAnnotation) is too costly to leave for Gemini to sort out after the fact.

## Steps

1. **Config.** Read the `indeed:` block from `config.yml` (repo root:
   `~/jobhunt`). If it's missing or has no `queries`, tell the user and stop.
   Fields: `queries` (list of `{search, location, country_code, job_type?}`),
   `max_new_per_run` (default 30), `days` (default 7). Also read the
   top-level `title_filter` (`positive`/`negative` lists), `location_filter`
   (`always_allow`/`allow`/`block`), and `company_blocklist` — the same
   filters `scan.mjs`/`aggregators.mjs` use for ATS boards and aggregators.

2. **Preflight.** The tools `mcp__claude_ai_Indeed__search_jobs` and
   `mcp__claude_ai_Indeed__get_job_details` must be available (load via
   ToolSearch if deferred). If the connector is missing, tell the user to
   enable the Indeed connector (claude.ai → Settings → Connectors), then stop.

3. **Load seen jobs.** From `data/scan-history.tsv` (skip the header line)
   collect the composite keys `title|company|location` (lowercased) of rows
   whose portal column is `indeed`. **Do NOT dedup by the View Job URL** —
   `to.indeed.com` shortlinks are per-impression: the same job gets a
   different link in every search.

4. **Search.** For each query call
   `search_jobs(search, location, country_code, job_type?)`. Each result block
   contains: Job Title, **Job Id** (e.g. `JOBSEARCH_3` — **ephemeral, valid
   only in this session, only for `get_job_details`**), Company, Location,
   `Posted on: <date>`, Job Type, Compensation, and View Job URL (a
   per-impression `https://to.indeed.com/…` shortlink; the importer resolves
   it to the stable `www.indeed.com/viewjob?jk=…` identity).

5. **Filter BEFORE fetching details** (each details call is an MCP call —
   don't waste them). Apply the same semantics as the shared
   `buildTitleFilter`/`buildLocationFilter` in `board-store.mjs` — drop the job
   if **any** of these hold:
   - its composite key `title|company|location` (lowercased) is in the seen
     set or was already collected this run (queries overlap);
   - its `Posted on` date is older than `days` days ago;
   - its title does **not** contain at least one `title_filter.positive` term
     (case-insensitive substring), when the list is non-empty;
   - its title **does** contain any `title_filter.negative` term **as a whole
     word, outside any matched positive phrase** — so "Salesforce" is not a
     `Sales` hit, and "Member of Technical Staff" is not a `Staff` hit, but
     "Staff Software Engineer" still is;
   - its location matches a `location_filter.block` term, unless it also
     matches `location_filter.always_allow` (which wins);
   - its company name contains any `company_blocklist` entry as a
     case-insensitive substring (e.g. "DataAnnotation" — this is a **hard
     drop** for Indeed, not the score-penalty-only treatment other lanes give
     the blocklist). Do **NOT** drop companies matching the separate
     `staffing_agencies` list (legit W2 staffing firms like TEKsystems,
     Robert Half) — the user is open to W2 contract roles; those pass
     through and rank.mjs applies its -40/🚯 penalty downstream.

   Example this catches: a "Software Engineer" query surfacing "Ingeniero de
   automatización (automation engineer)" — no `title_filter.positive` term
   matches, so it's dropped before spending a details call on it.

6. **Cap** the survivors at `max_new_per_run`.

7. **Details.** For each survivor call `get_job_details(job_id)` **now, in
   this same session** — the ids expire. If a call fails, keep the job with
   `desc: ""` (rank.mjs flags it `· no JD text` and caps its AI score).

8. **Write the import JSON** to a scratchpad temp file:

   ```json
   { "jobs": [ {
       "url": "https://to.indeed.com/…",
       "title": "…", "company": "…", "location": "…",
       "posted": "May 21, 2026",
       "salary": "$50 - $100 an hour",
       "job_type": "Full-time",
       "desc": "full JD text from get_job_details"
   } ] }
   ```

   Pass `posted` raw (the importer normalizes to ISO); `salary`/`job_type`
   may be null; `desc` may be `""`.

9. **Import.** From the repo root run `node indeed.mjs --import <file>` and
   relay its summary to the user. (It re-dedups authoritatively, re-enforces
   the cap, sanitizes fields, and appends `data/indeed-jds.json` +
   `data/scan-history.tsv` with portal `indeed`. It never touches
   `data/pipeline.md`.)

10. **Rank.** Offer to run `node rank.mjs --ai` (writes
    `data/indeed-openings.md`) and show the user the top 5 rows.
