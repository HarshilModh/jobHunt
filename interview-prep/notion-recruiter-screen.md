# Notion — Recruiter Screen Prep (Software Engineer, New Grad)

**Round:** Recruiter / HR phone screen (first round) · **When:** next week · **Researched:** 2026-06-13
**Audience:** `recruiter-screen` — a *fit gate*, not a technical test.
**Sources:** Glassdoor (Notion interview reviews), Levels.fyi (Notion comp). Cited inline.

> You already have the deep technical prep in `interview-prep/notion.md` (stack, block model,
> Postgres sharding) and `interview-prep/notion-qa.md` (full Q&A). **Do NOT lead with that here.**
> Save it for the technical phone screen + onsite. This round is about whether you're a real,
> qualified, motivated candidate who fits logistically. Win it on fit, not architecture.

---

## What the recruiter screen actually tests

Per Glassdoor: Notion's process is **recruiter screen → hiring manager → technical (60-min) →
onsite (4×1h, 2 of them coding) → case study panel**. Avg ~19 days end-to-end; difficulty 3.11/5;
55.6% positive experience. The recruiter asks **screener questions written by the hiring manager**
to weed out non-qualified applicants — they're vetting fit and logistics, and they're typically
kind, not adversarial. [Glassdoor]

So they're checking, in order: *Is he real and qualified? Is he actually motivated for THIS?
Do the logistics work (location, visa, timeline, comp)?* Your job is to pass all three cleanly
and give them zero reason to deprioritize you.

---

## The 5 things you must nail (rehearse these out loud)

### 1. "Tell me about yourself" — 45–60s, lighter than the technical version

Recruiters want the *shape* of you, not the architecture. Trim the deep-tech version from
`notion-qa.md`:

> I'm finishing my MS in CS at Stevens — 3.86 GPA, graduating May 2026. Before grad school I
> interned as a software engineer at Grownited, where I built RBAC-gated CRM modules and cut
> API latency in half with Redis caching. At Stevens I've been a TA for the graduate web
> programming course — mentoring 100+ students — and I published an npm CLI that automates our
> grading workflow, around 1,400 downloads a week. On the side I've shipped three full-stack
> systems end to end: a real-time caregiving platform, an AI repo-health analyzer, and an
> AI app-generation tool. I'm targeting backend / full-stack new-grad roles, and Notion is my
> top choice — I'm a daily power user and I've been following your engineering blog for a while.

Land it in under a minute. End on "Notion is my top choice" — that's the hook the recruiter wants.

### 2. "Why Notion?" — keep it to 2 crisp reasons, not 3 paragraphs

The recruiter isn't grading architecture depth; they want genuine, specific motivation:

> Two things. First, I'm a real daily user — I run my coursework, project planning, even my job
> search in Notion, so I know the product as a power user, not casually. Second, the engineering
> is the kind of problem I want to work on: I've read your posts on re-sharding Postgres and the
> WASM-SQLite offline work, and that scale-with-craft combination is exactly what I'm looking for.

(You *can* gesture at the block model, but don't monologue — save the deep version for the HM/peer.)

### 3. Comp expectation — give a researched range, then defer cleanly

This is where new grads fumble. Don't blurt a single number; don't say "I'm flexible / whatever
you offer" (reads as no homework). Anchor to research, then hand the band back to them.

**The data (Levels.fyi, Notion, entry-level NYC):** L1 new-grad total ≈ **$235K** — base **~$156K**,
stock **~$77K**, bonus **~$2K**. [Levels.fyi] Notion equity is rich but **private/illiquid** (4-year
vest, 25%/yr) — weight the **base** as the real near-term number. SF bands run a bit higher than NYC.

**Script:**
> I've been calibrating to market for a new-grad SWE — for Notion I've seen total comp around the
> low-200s with a base in the mid-150s, but I know that moves with level and location. I'm more
> focused on the role and the team than on squeezing the number, so I'd love to hear the band
> you're working with for this role.

If pushed for a hard floor: give the base range (~$150–165K), never a single point. You have low
leverage as a new grad with no competing offer yet — deferring is correct, not weak.

### 4. Location / visa — answer before they have to dig (this is your biggest logistics gate)

**Two things to clarify and address:**

- **Location:** The new-grad roles you flagged are likely **SF-based** (Notion HQ; they have a NYC
  presence but new-grad SWE is mostly SF). You're Hoboken/NYC-priority. **Don't hide it — ask early.**
  > Quick logistics question — is this role SF-based or is NYC / remote an option? I'm NYC-based and
  > strongly prefer it, but for Notion specifically I'm open to relocating to SF for the right team.

  Decide your real answer *before* the call. If SF is a dealbreaker, say so kindly now — don't waste
  five rounds. If you'd move for Notion, say that clearly; it removes a silent objection.

- **Visa (F-1) — say it factually, never apologetically.** Notion sponsors (confirmed). Frame it as
  "I'm work-authorized for ~3 years before sponsorship is even a question":
  > On work authorization — I'm on an F-1 student visa, I'll have OPT work authorization starting
  > May 2026, and as a STEM grad I'm eligible for the 24-month STEM extension. So that's about three
  > years of work authorization before H-1B sponsorship would come up, and I understand Notion does
  > sponsor. Happy to go into specifics if useful.

  Flat, confident, done. Do not over-explain or apologize. (See the red-flag section in `AGENTS.md`.)

### 5. Timeline / availability — numbers, not vibes

> I graduate in May 2026 and I'm available to start full-time right after — flexible on the exact
> date. I'm early in my search, talking to a few teams, but Notion is my top priority.

"A few teams" signals you're in demand without lying or oversharing. Never name the other companies.

---

## Reverse questions for the recruiter (ask 2–3 — shows you're serious)

Aimed at the recruiter (logistics/process), **not** technical depth — save those for the engineers:
- "What does the full process look like and the rough timeline from here?"
- "Is this role SF-based, or is there NYC / remote flexibility for new grads?"
- "What does the team look like for new grads — is there a structured onboarding or mentorship?"
- "What's the start-date window you're targeting for the new-grad class?"

---

## What NOT to do (recruiter-screen failure modes)

- ❌ Don't deep-dive architecture/the block model unprompted — you'll seem unable to read the room.
- ❌ Don't give a single hard comp number, and don't say "whatever you offer."
- ❌ Don't hide the location/visa situation hoping it won't come up — surface it cleanly yourself.
- ❌ Don't badmouth or over-discuss Notion's press / layoffs / competitors.
- ❌ Don't ramble. Recruiter answers are 30–60s each; this isn't the round to show technical depth.

---

## Prep plan for the week (recruiter screen = light lift, high polish)

This round needs **polish, not cramming**. Days before:
- **Now:** Lock your real answers to the 5 above — especially **comp range** and the **SF-vs-NYC**
  decision (decide it before the call). Rehearse TMAY + Why-Notion out loud until they're under 60s.
- **2–3 days before:** Re-read your "why Notion" so it sounds spoken, not memorized. Skim Notion's
  latest blog post / any recent launch so "why now" has a fresh, specific hook.
- **Night before:** Re-read this doc + your F-1 line + comp script. Have 2–3 reverse questions ready.
  Logistics: quiet room, charged phone, headphones, CV open, water.
- **Don't** spend this week on LeetCode or system design — that's for *after* you clear this round.
  (When you do get the technical screen, switch to `notion-qa.md`, `notion.md`, and
  `node dsa.mjs Notion`.)

---

## What's coming next (so you pace yourself)

If you pass: **hiring manager** (motivation + scope — use `interview-prep/notion.md`) → **60-min
technical** → **onsite (4×1h, 2 coding)** → **case study panel**. Your technical prep for those
already exists and is strong; this week is purely about clearing the recruiter gate. One thing at a
time. [Glassdoor]

---

**Sources:**
- [Notion interview process & difficulty — Glassdoor](https://www.glassdoor.com/Interview/Notion-Interview-Questions-E1530032.htm)
- [Notion entry-level SWE comp (NYC L1) — Levels.fyi](https://www.levels.fyi/companies/notion/salaries/software-engineer/levels/l4)
