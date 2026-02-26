# Technical Specification: workout

**Date:** 2026-02-26
**Author:** trom
**Version:** 1.0
**Project Type:** web-app
**Project Level:** 1
**Status:** Draft

---

## Document Overview

This Technical Specification provides focused technical planning for the workout fitness dashboard — a static web app that parses daily Health Connect exports and displays training, body metrics, and nutrition data for coach review.

**Related Documents:**
- Product Brief: `docs/product-brief-workout-2026-02-26.md`

---

## Problem & Solution

### Problem Statement

Fitness data is spread across multiple Android apps that sync to Health Connect. Sharing progress with a coach requires manual effort and produces incomplete, inconsistent reports.

### Proposed Solution

A Python script parses the daily Health Connect SQLite export into a static JSON file. A vanilla HTML/JS dashboard reads that JSON and renders charts and tables. Deployed to Vercel via GitHub — one `git push` updates the live public URL.

---

## Requirements

### What Needs to Be Built

- **R1 — DB Parser:** Python script that reads `health_connect_export.db` and outputs `public/data.json` containing:
  - All exercise sessions (date, title, duration, sets × reps × weight per segment)
  - Daily weight readings (kg, converted from grams)
  - Body fat % readings
  - Daily nutrition totals (calories in kcal, protein g, carbs g, fat g — converted from joules/grams)

- **R2 — Weight Chart:** Line chart showing weight over time (last 90 days default, full history available)

- **R3 — Workout Log:** Table/list of sessions sorted by date, showing title, duration, and expandable set details

- **R4 — Nutrition Summary:** Daily calories and macros (bar or line chart + today's totals)

- **R5 — Body Composition:** Body fat % trend chart (sparse data handled gracefully)

- **R6 — Vercel Deployment:** Repo connected to Vercel, auto-deploys on push to `main`

- **R7 — Update Pipeline:** Documented one-command workflow to refresh the dashboard from a new `.db` file

### What This Does NOT Include

- Authentication or access control
- Real-time or push updates
- Sleep, steps, or heart rate data (future)
- Mobile-native app
- Backend server or database
- Coach comments or annotations

---

## Technical Approach

### Technology Stack

- **Parser:** Python 3.11+ (stdlib only — `sqlite3`, `json`, `datetime`; no external dependencies)
- **Frontend:** Vanilla HTML5 + CSS + JavaScript (ES6 modules)
- **Charts:** [Chart.js](https://www.chartjs.org/) via CDN (no build step)
- **Hosting:** Vercel (free tier, static site)
- **Source control:** GitHub (`limiteinductive/workout`)
- **Data format:** JSON (`public/data.json`)

### Architecture Overview

```
Android apps (workout, scale, nutrition)
        ↓ sync
Health Connect (Android)
        ↓ daily export
health_connect_export.db  →  Google Drive (backup/archive)
        ↓ manual copy to repo
workout/
  parse.py              ← parses DB → public/data.json
  public/
    index.html          ← dashboard UI
    app.js              ← chart + table rendering
    data.json           ← generated, gitignored? or committed
        ↓ git push
GitHub (main branch)
        ↓ webhook
Vercel                  → https://workout.vercel.app (public URL)
```

**Update flow (manual, ~30 seconds):**
```bash
cp ~/path/to/health_connect_export.db .
python parse.py
git add public/data.json
git commit -m "data: $(date +%Y-%m-%d)"
git push
```
Vercel auto-deploys in ~10 seconds after push.

### Data Model

Output JSON structure (`public/data.json`):

```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "weight": [
    { "date": "2026-02-26", "kg": 107.1 }
  ],
  "body_fat": [
    { "date": "2026-02-11", "pct": 25.2 }
  ],
  "nutrition": [
    { "date": "2026-02-26", "kcal": 2100, "protein_g": 180, "carbs_g": 200, "fat_g": 60 }
  ],
  "workouts": [
    {
      "date": "2026-02-26",
      "title": "Workout A",
      "duration_min": 81,
      "segments": [
        { "set_index": 1, "type_id": 64, "reps": 11, "weight_kg": null }
      ]
    }
  ]
}
```

**Unit conversions in parser:**
- Weight: grams → kg (`/ 1000`)
- Energy: joules → kcal (`/ 4184`)
- Timestamps: Unix ms → ISO date string

### API Design

N/A — static site, no API. Dashboard fetches `data.json` at load time via `fetch('./data.json')`.

---

## Implementation Plan

### Stories

1. **Story 1 — DB Parser** — Python script that reads all relevant tables from the Health Connect SQLite DB and writes clean `public/data.json`. Includes unit conversions and exercise type ID mapping.

2. **Story 2 — Dashboard Shell** — `index.html` with layout, CSS, and Chart.js loaded. Fetches `data.json` and confirms data loads correctly.

3. **Story 3 — Weight & Body Composition Charts** — Weight trend line chart + body fat % chart. Date range selector (30/90/all).

4. **Story 4 — Workout Log** — Sortable session list with expandable set details. Shows muscle group from title, sets, reps, weight.

5. **Story 5 — Nutrition Summary** — Daily macro totals chart + today's summary card (calories, protein, carbs, fat).

6. **Story 6 — Deployment & Pipeline** — Vercel project setup, `update.sh` helper script, README with update instructions.

### Development Phases

- **Phase 1 (Stories 1–2):** Data pipeline working end-to-end, raw data confirmed in browser
- **Phase 2 (Stories 3–5):** All charts and tables rendering correctly
- **Phase 3 (Story 6):** Deployed, URL shared with coach, pipeline documented

---

## Acceptance Criteria

- [ ] `python parse.py` runs without errors and produces valid `public/data.json`
- [ ] Dashboard loads in a browser and displays data without errors
- [ ] Weight chart shows at least 30 days of history
- [ ] Most recent workout session is visible on page load
- [ ] Daily macros (today) are shown prominently
- [ ] Page loads in under 3 seconds on mobile (4G)
- [ ] Public Vercel URL is accessible without login
- [ ] `git push` triggers Vercel redeploy within 30 seconds
- [ ] Coach can understand the dashboard without any explanation

---

## Non-Functional Requirements

### Performance

- Static site — no server latency
- `data.json` should stay under 500KB (currently ~1 year of data fits comfortably)
- Charts render within 1 second of page load

### Security

- No auth required (by design — fully public)
- No user input, no forms, no server-side code
- `.db` file should NOT be committed to the repo (contains raw health data)

### Other

- Mobile-friendly layout (coach may view on phone)
- Works in latest Chrome, Safari, Firefox
- No build step required — open `index.html` directly for local dev

---

## Dependencies

- Python 3.11+ on developer machine (for parser)
- GitHub account + repo: `limiteinductive/workout`
- Vercel account connected to GitHub (free tier)
- Health Connect export file available locally
- Google Drive folder for `.db` archival: https://drive.google.com/drive/folders/1glsuyQbSMLym6uynakK4S-Qxj-29pidA

---

## Risks & Mitigation

- **Risk:** Exercise segment `type_id` integers are undocumented — mapping to exercise names is unclear
  - **Mitigation:** Build a lookup table from observed data; display type ID as fallback if unmapped; enrich over time

- **Risk:** Nutrition energy unit unclear (joules vs millijoules in DB)
  - **Mitigation:** Cross-check one known meal (e.g., protein bar with known ~200 kcal) against raw value to confirm unit; add assertion in parser

- **Risk:** `.db` schema may change with Health Connect app updates
  - **Mitigation:** Parser validates expected columns on startup and fails loudly with clear error message

- **Risk:** `data.json` grows large over time
  - **Mitigation:** Cap history at 365 days in parser; older data archived separately if needed

---

## Timeline

**Target Completion:** ASAP (before next coaching session)

**Milestones:**
- Story 1 (Parser): Day 1
- Stories 2–5 (Dashboard): Day 2
- Story 6 (Deploy + docs): Day 3
- Coach review: Day 4

---

## Approval

**Reviewed By:**
- [ ] trom (Author)
- [ ] Technical Lead
- [ ] Product Owner

---

## Next Steps

For Level 1 projects (1-10 stories):
- Run `/sprint-planning` to plan the sprint
- Then create and implement stories

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**

*To continue: Run `/workflow-status` to see your progress and next recommended workflow.*
