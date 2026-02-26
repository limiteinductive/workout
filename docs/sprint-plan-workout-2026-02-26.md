# Sprint Plan: workout

**Date:** 2026-02-26
**Scrum Master:** trom
**Project Level:** 1
**Total Stories:** 6
**Total Points:** 16
**Planned Sprints:** 1 (today)

---

## Executive Summary

Single-day sprint to build and ship the workout dashboard. Parser → dashboard → deploy. Coach gets a URL by end of day.

**Key Metrics:**
- Total Stories: 6
- Total Points: 16
- Sprints: 1
- Target Completion: 2026-02-26 (today)

---

## Story Inventory

### STORY-001: DB Parser

**Priority:** Must Have
**Points:** 3

**User Story:**
As trom,
I want a Python script that parses the Health Connect SQLite DB
So that workout, weight, body fat, and nutrition data is available as clean JSON

**Acceptance Criteria:**
- [ ] Reads `health_connect_export.db` from repo root
- [ ] Outputs `public/data.json` with weight (kg), body fat (%), nutrition (kcal + macros in g), and workout sessions (date, title, duration, segments)
- [ ] Unit conversions correct: grams→kg, joules→kcal
- [ ] Timestamps converted to ISO date strings (local time)
- [ ] Script runs with `python parse.py` — no arguments needed
- [ ] Fails loudly if expected tables are missing

**Technical Notes:**
- Use Python stdlib only: `sqlite3`, `json`, `datetime`
- Weight stored in grams in DB (`/ 1000` → kg)
- Energy stored in joules (`/ 4184` → kcal)
- Aggregate nutrition by calendar day (sum all meals)
- One JSON entry per workout session; segments array per session
- Keep `.db` out of git (add to `.gitignore`)

**Dependencies:** None

---

### STORY-002: Dashboard Shell

**Priority:** Must Have
**Points:** 2

**User Story:**
As trom,
I want a single HTML page that loads `data.json`
So that I have a working foundation to build charts on

**Acceptance Criteria:**
- [ ] `public/index.html` loads in browser without errors
- [ ] Fetches `data.json` and logs parsed data to console
- [ ] Mobile-friendly layout with simple navigation (tabs or sections: Overview, Workouts, Nutrition)
- [ ] Chart.js loaded from CDN
- [ ] Works locally via `open public/index.html` (no server needed)

**Technical Notes:**
- Vanilla HTML + CSS + JS, no framework, no build step
- Use CSS Grid or Flexbox for layout
- Chart.js from `https://cdn.jsdelivr.net/npm/chart.js`

**Dependencies:** STORY-001 (needs `data.json` structure)

---

### STORY-003: Weight & Body Fat Charts

**Priority:** Must Have
**Points:** 3

**User Story:**
As the coach,
I want to see weight and body fat trends over time
So that I can assess body composition progress

**Acceptance Criteria:**
- [ ] Weight chart: line chart, last 90 days by default
- [ ] Shows current weight prominently (latest reading)
- [ ] Body fat % chart: line chart (sparse data rendered gracefully — only dots where data exists)
- [ ] X-axis shows dates, Y-axis shows values with units (kg, %)
- [ ] Charts are readable on mobile

**Technical Notes:**
- Chart.js line chart, `tension: 0.3` for smooth curve
- Body fat has only ~10 data points — use `spanGaps: false` so gaps show clearly
- Weight in ~107kg range — Y-axis should start near min value, not zero

**Dependencies:** STORY-002

---

### STORY-004: Workout Log

**Priority:** Must Have
**Points:** 3

**User Story:**
As the coach,
I want to see a log of workout sessions with set details
So that I can review training load and progression

**Acceptance Criteria:**
- [ ] Lists all sessions, most recent first
- [ ] Each entry shows: date, title (e.g. "Workout A"), duration in minutes
- [ ] Sessions are expandable/collapsible to show set details
- [ ] Set details show: set index, rep count, weight (if available)
- [ ] At least last 30 sessions visible without scrolling to death (pagination or lazy load)

**Technical Notes:**
- Pure DOM manipulation — no framework
- Collapse/expand with `<details>` HTML element (zero JS needed)
- Exercise type IDs are integers — display as-is for now, can enrich later
- Duration = `(end_time - start_time) / 1000 / 60` rounded to nearest minute

**Dependencies:** STORY-002

---

### STORY-005: Nutrition Summary

**Priority:** Must Have
**Points:** 3

**User Story:**
As the coach,
I want to see daily nutrition totals
So that I can assess dietary compliance and macro balance

**Acceptance Criteria:**
- [ ] Today's macros shown as summary cards: kcal, protein (g), carbs (g), fat (g)
- [ ] 30-day calorie trend as a bar chart
- [ ] 30-day protein trend as a line chart
- [ ] If no data for today, show most recent day's data with date label

**Technical Notes:**
- Nutrition is aggregated by day in the parser (sum all meals per day)
- Energy conversion: joules → kcal = `/ 4184`
- Keep charts simple — daily bars/lines, no stacking needed

**Dependencies:** STORY-002

---

### STORY-006: Deployment & Pipeline

**Priority:** Must Have
**Points:** 2

**User Story:**
As trom,
I want a live public URL and a one-command update flow
So that the dashboard stays current with minimal effort

**Acceptance Criteria:**
- [ ] Vercel project connected to `limiteinductive/workout` GitHub repo
- [ ] Auto-deploys on push to `main`
- [ ] Public URL accessible without login
- [ ] `update.sh` script in repo root: copies db, runs parser, commits, pushes
- [ ] `.gitignore` excludes `health_connect_export.db`
- [ ] `README.md` with: what it is, how to update, the public URL

**Technical Notes:**
- Vercel root directory: `public/` (or configure `vercel.json`)
- `update.sh`:
  ```bash
  #!/bin/bash
  cp "$1" ./health_connect_export.db
  python parse.py
  git add public/data.json
  git commit -m "data: $(date +%Y-%m-%d)"
  git push
  ```
- Usage: `./update.sh ~/path/to/health_connect_export.db`

**Dependencies:** STORY-001, STORY-002, STORY-003, STORY-004, STORY-005

---

## Sprint Allocation

### Sprint 1 — Today — 16/16 points

**Goal:** Ship a live public dashboard the coach can open today

**Implementation order (respects dependencies):**
1. STORY-001: DB Parser (3 pts) — foundation, do first
2. STORY-002: Dashboard Shell (2 pts) — framework for all charts
3. STORY-003: Weight & Body Fat Charts (3 pts)
4. STORY-004: Workout Log (3 pts)
5. STORY-005: Nutrition Summary (3 pts)
6. STORY-006: Deploy & Pipeline (2 pts) — do last, ships everything

---

## Requirements Coverage

| Story | Requirement |
|-------|------------|
| STORY-001 | R1 — DB Parser |
| STORY-002 | R6 — Vercel Deployment (shell) |
| STORY-003 | R2 — Weight Chart, R5 — Body Composition |
| STORY-004 | R3 — Workout Log |
| STORY-005 | R4 — Nutrition Summary |
| STORY-006 | R6 — Deployment, R7 — Update Pipeline |

---

## Definition of Done

For a story to be considered complete:
- [ ] Feature works in the browser
- [ ] No console errors
- [ ] Looks reasonable on mobile
- [ ] Code committed to `main`

---

## Next Steps

Run `/dev-story STORY-001` to start the DB parser — or just say "let's build".

---

**This plan was created using BMAD Method v6 - Phase 4 (Implementation Planning)**
