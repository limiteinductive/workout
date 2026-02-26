# Product Requirements Document: workout v2

**Date:** 2026-02-26
**Author:** trom
**Version:** 2.0
**Project Type:** web-app
**Project Level:** 2
**Status:** Draft

---

## Document Overview

This PRD defines requirements for the workout dashboard v2 — a hypertrophy-focused coaching intelligence tool. **MacroFactor XLSX exports are the primary data source.** Health Connect SQLite is the secondary source for body metrics and cardio sessions.

**Related Documents:**
- Product Brief: `docs/product-brief-workout-v2-2026-02-26.md`
- v1 Tech Spec: `docs/tech-spec-workout-2026-02-26.md`

---

## Data Source Architecture

### Primary: MacroFactor XLSX Exports

MacroFactor exports monthly XLSX files with 6 sheets each:

| Sheet | Key Fields | Used For |
|-------|-----------|----------|
| **Quick Export** | Date, TDEE, Trend Weight, Weight, Calories, Protein, Fat, Carbs, Targets, Steps | Nutrition dashboard, weight trend, TDEE |
| **Food Log** | Date, Time, Food Name, Calories, Protein, Fat, Carbs | Detailed food view |
| **Muscle Groups - Sets** | Date + 22 muscle groups (sets/day) | Volume indexes, heatmap |
| **Muscle Groups - Volume** | Date + 22 muscle groups (kg/day) | Volume load tracking |
| **Workout Log** | Date, Workout, Exercise, Weight (kg), Reps, RIR, Set Type | Progressive overload, exercise tracking |
| **Active Program** | Programme structure | Context only |

**22 tracked muscle groups:** Chest, Quads, Upper Back, Glutes, Lats, Hamstrings, Biceps, Triceps, Front Delts, Side Delts, Lower Back, Abs, Calves, Upper Traps, Rear Delts, Forearms, Obliques, Abductors, Adductors, Neck, Tibialis, Serratus

### Secondary: Health Connect SQLite

| Table | Used For |
|-------|----------|
| `weight_record_table` | Raw scale weight (fallback if MF weight missing) |
| `body_fat_record_table` | Scale BF% (unreliable, used for comparison only) |
| `exercise_session_record_table` | Cardio/VO2 sessions, padel sessions |

### Pipeline

```
MacroFactor monthly XLSX files  ──┐
                                   ├── parse.py ──→ public/data.json ──→ Vercel
Health Connect daily .db ──────────┘
```

Parser reads **all** XLSX files in `drive_export/workout/` and merges them chronologically. User adds new monthly exports to that folder.

---

## Executive Summary

Transform the workout dashboard into a coaching intelligence platform using MacroFactor as the primary data source. V2 delivers: per-exercise progressive overload tracking with actual weights, pre-calculated muscle group volume across 22 muscle groups, TDEE-aware nutrition analysis, body composition estimation, and a coach-optimised summary view — all from a zero-infrastructure static site.

---

## Product Goals

### Business Objectives

- Coach can assess Benjamin's full training status in <10 seconds from one URL
- Benjamin reaches 15% BF while maximising lean mass retention
- Progressive overload stalls caught per exercise within 2 weeks
- Overtraining and push/pull imbalances flagged automatically
- Zero manual reporting — fully derived from MacroFactor + Health Connect exports

### Success Metrics

- Coach answers "how is training going?" in <10 seconds
- Lean mass stable or increasing while weight drops
- Push/Pull balance within 80–120% range
- Progressive overload visible per exercise over time
- Nutrition adherence tracked against MF targets (not hardcoded)

---

## Functional Requirements

---

### FR-001: MacroFactor XLSX Parser

**Priority:** Must Have

**Description:**
Core parser that reads all MacroFactor monthly XLSX files from `drive_export/workout/`, merges data chronologically, and outputs enriched `public/data.json`. Replaces Health Connect as primary source for nutrition and workout data.

**Acceptance Criteria:**
- [ ] Reads all `*.xlsx` files matching `MacroFactor-*.xlsx` pattern in `drive_export/workout/`
- [ ] Merges Quick Export, Workout Log, Muscle Groups - Sets/Volume across all monthly files
- [ ] Deduplicates overlapping date ranges (latest file wins)
- [ ] Outputs merged, sorted data to `data.json`
- [ ] Falls back to Health Connect for weight/BF% data if MF weight missing for a date
- [ ] Runs via `uv run python parse.py` — openpyxl handled by uv/pyproject.toml

---

### FR-002: BF% Estimation Engine

**Priority:** Must Have

**Description:**
Estimated BF% calculated from anthropometric formulas to replace unreliable scale readings. Uses YMCA (waist + weight) and Deurenberg (BMI + age) methods. Athlete profile stored in `workout-config.json`.

**Acceptance Criteria:**
- [ ] YMCA formula: `bf = ((-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb) × 100`
- [ ] Deurenberg: `bf = (1.20 × bmi) + (0.23 × age) - (10.8) - 5.4`
- [ ] Both estimates calculated for every weight entry
- [ ] Athlete profile (age=31, height=181cm, waist=101cm) in `workout-config.json`
- [ ] Spot check: at 107 kg / 101 cm waist → YMCA ~20%

---

### FR-003: Lean Mass & FFMI Tracking

**Priority:** Must Have

**Description:**
Lean mass (`weight × (1 - bf%)`) and FFMI (`lean_kg / height_m²`) calculated from formula-estimated BF% and MF's trend weight (smoother than raw scale). Primary body composition signal during the cut.

**Acceptance Criteria:**
- [ ] Lean mass calculated using MF trend weight + formula BF% (not noisy scale BF%)
- [ ] Lean mass trend line shown alongside total weight on body comp chart
- [ ] FFMI chart with reference lines at 22 / 25 / 28
- [ ] Current lean mass and FFMI on Coach Brief card
- [ ] Trend direction labelled (↑ building / → maintaining / ↓ losing)

---

### FR-004: Cut Progress Tracker

**Priority:** Must Have

**Description:**
Visual cut progress: start (120 kg) → current → projected target. Uses MF trend weight and formula-estimated BF%. Projected completion date from 30-day rate of change.

**Acceptance Criteria:**
- [ ] Start weight (120 kg) and target BF% (15%) from `workout-config.json`
- [ ] Target weight calculated: `lean_mass / (1 - 0.15)`
- [ ] Rate of loss from last 30 days of MF trend weight
- [ ] Projected completion date shown with "estimated" label
- [ ] kg lost / kg remaining displayed

---

### FR-005: TDEE & Energy Balance Tracking

**Priority:** Should Have

**Description:**
MacroFactor estimates TDEE daily. Display TDEE trend alongside caloric intake to visualise the actual energy deficit — more accurate than a fixed 500 kcal assumption.

**Acceptance Criteria:**
- [ ] TDEE from MF Quick Export plotted as line chart
- [ ] Actual deficit = TDEE − calories shown per day
- [ ] 7-day avg deficit shown on Coach Brief
- [ ] Flag days where deficit >800 kcal (excessive, muscle loss risk)

---

### FR-006: Push / Pull / Upper / Lower Indexes

**Priority:** Must Have

**Description:**
Four synthetic weekly volume indexes derived from MacroFactor's Muscle Groups - Sets data. No manual workout config mapping needed — MF already attributes sets to 22 muscle groups.

**Muscle group groupings:**
- **Push**: Chest + Front Delts + Side Delts + Triceps
- **Pull**: Lats + Upper Back + Rear Delts + Biceps
- **Upper**: Push + Pull + Upper Traps
- **Lower**: Quads + Hamstrings + Glutes + Calves

**Volume zones (sets/week):**
- 🔵 Below MEV — under-training
- 🟢 MEV → MAV — optimal
- 🟡 MAV → MRV — high, monitor
- 🔴 Above MRV — overtraining risk

**Acceptance Criteria:**
- [ ] Weekly totals calculated from summing daily MF muscle group sets
- [ ] 4 index cards: Push / Pull / Upper / Lower with zone colour + delta vs last week
- [ ] Weekly index history chart (last 8 weeks)
- [ ] MEV/MRV defaults from `workout-config.json` (configurable)

---

### FR-007: 22-Muscle Volume Heatmap

**Priority:** Should Have

**Description:**
Grid: 22 muscle groups (rows) × last 8 calendar weeks (columns). Cell colour = volume zone. The most granular view of training balance available — directly from MF data, no estimation.

**Acceptance Criteria:**
- [ ] All 22 MF muscle groups shown as rows
- [ ] Columns = ISO calendar weeks, last 8 weeks
- [ ] Cell colour = volume zone using sets from MF Muscle Groups - Sets
- [ ] Cell tooltip shows exact set count + volume (kg) from MF Muscle Groups - Volume
- [ ] Muscle groups with no data shown in grey

---

### FR-008: Push / Pull Balance Score

**Priority:** Must Have

**Description:**
Weekly Push sets ÷ Pull sets ratio. Flagged when outside 80–120%.

**Acceptance Criteria:**
- [ ] Ratio calculated from FR-006 push/pull totals
- [ ] Displayed as percentage with colour (green/yellow/red)
- [ ] On Coach Brief card
- [ ] 8-week trend chart on Athlete View

---

### FR-009: Per-Exercise Progressive Overload Tracker

**Priority:** Must Have

**Description:**
For every exercise in the MF Workout Log, track weight (kg) and volume load (weight × reps) over time. Highlight PRs. Flag stalls (no weight increase for 3+ sessions of same exercise).

**Acceptance Criteria:**
- [ ] Parser outputs per-exercise history: date, weight, reps, RIR, set type
- [ ] Exercise list view: searchable/filterable list of all exercises performed
- [ ] Clicking an exercise shows: weight trend chart, volume load trend, all sets table
- [ ] PR sessions highlighted in accent colour
- [ ] Stall flag: weight not increased for 3+ consecutive same-exercise sessions
- [ ] Active stalls shown on Coach Brief

---

### FR-010: RIR Trend Tracking

**Priority:** Should Have

**Description:**
MacroFactor records RIR (Reps In Reserve) per set. Track average RIR per workout over time — lower RIR = higher intensity. Useful for monitoring training effort and progressive overload quality.

**Acceptance Criteria:**
- [ ] Average RIR per workout session calculated
- [ ] RIR trend chart on Athlete View (lower = harder)
- [ ] Sessions with RIR = 0 (failure sets) highlighted
- [ ] 4-week avg RIR shown on Coach Brief

---

### FR-011: Volume Spike Detector

**Priority:** Should Have

**Description:**
Flag weeks where total training volume (sets across all muscle groups) exceeds prior 4-week average by >20%.

**Acceptance Criteria:**
- [ ] Rolling 4-week average total weekly sets calculated
- [ ] Current week flagged if >120% of rolling average
- [ ] Flag shown on Coach Brief: "⚠ Volume spike this week"
- [ ] Historical spikes marked on volume trend chart

---

### FR-012: Cardio & Sport Tracker

**Priority:** Should Have

**Description:**
VO2 bike sessions and padel sessions from Health Connect (not in MF). Show weekly counts vs targets.

**Acceptance Criteria:**
- [ ] Sessions classified from HC exercise type and title keywords
- [ ] VO2 session count vs target (2/week) with green/red indicator
- [ ] Padel session count shown
- [ ] Training distribution: strength / cardio / sport on Coach Brief

---

### FR-013: Nutrition Adherence

**Priority:** Must Have

**Description:**
Using MF Quick Export which includes both actual and target macros per day — adherence is exact, not estimated from hardcoded targets.

**Acceptance Criteria:**
- [ ] Protein adherence: % of days where actual ≥ target protein (from MF)
- [ ] Calorie adherence: % of days within ±200 kcal of MF target
- [ ] 7-day and 30-day adherence scores
- [ ] Calendar heatmap of protein hit/miss days
- [ ] Today's macros vs targets on Coach Brief

---

### FR-014: Nutrition × Training Correlation Flag

**Priority:** Should Have

**Description:**
Flag days where calories were significantly below target AND training volume was above average.

**Acceptance Criteria:**
- [ ] Flag days: actual calories < (target − 400) AND muscle group sets > 30-day avg
- [ ] Flagged days shown on nutrition chart
- [ ] Count in last 7 days on Coach Brief

---

### FR-015: Coach Brief Card

**Priority:** Must Have

**Description:**
Pinned summary at top of page. Readable in <10 seconds on mobile.

**Contents:**
- Latest MF trend weight + 7-day delta
- Estimated lean mass + FFMI
- Training streak (consecutive days with MF workout log entries)
- This week: Push / Pull / Upper / Lower sets with zone colours
- Push/Pull balance score
- 7-day protein adherence % vs MF target
- 7-day avg calories vs MF target + avg deficit
- Active flags: volume spike / stall / imbalance / recovery risk

**Acceptance Criteria:**
- [ ] Visible without scrolling on all screen sizes
- [ ] All values from `data.json` — no hardcoded numbers
- [ ] Flags as colour-coded pills (🟢 / 🟡 / 🔴)
- [ ] Renders in <1 second

---

### FR-016: Coach View / Athlete View Toggle

**Priority:** Must Have

**Description:**
Two views via toggle at top of page.

- **Coach View**: Coach Brief + weekly index summary + cut progress + flags. One screen.
- **Athlete View**: Full dashboard — all charts, exercise log, heatmap, nutrition detail, progressive overload.

**Acceptance Criteria:**
- [ ] Toggle clearly labelled "Coach" / "Athlete"
- [ ] Default: Coach View
- [ ] Toggle state persists in `localStorage`
- [ ] Coach View fits one screen without scrolling (mobile and desktop)

---

### FR-017: Update Pipeline v2

**Priority:** Must Have

**Description:**
Updated `update.sh` that handles both MacroFactor XLSX and Health Connect DB. User drops new monthly XLSX into `drive_export/workout/` and runs the script.

**Acceptance Criteria:**
- [ ] `update.sh` runs `uv run python parse.py` (no args needed)
- [ ] Parser auto-discovers all `MacroFactor-*.xlsx` in `drive_export/workout/`
- [ ] Health Connect DB path configurable (default: `./health_connect_export.db`)
- [ ] README updated with new workflow
- [ ] `drive_export/` added to `.gitignore` (raw exports not committed)

---

## Non-Functional Requirements

---

### NFR-001: Performance

**Priority:** Must Have

- `data.json` < 500 KB
- Page fully rendered < 3s on 4G mobile
- All charts render < 1s after data load

---

### NFR-002: Mobile Usability

**Priority:** Must Have

- Coach Brief readable without zooming at 390px width
- No horizontal scroll
- Touch-friendly chart tooltips

---

### NFR-003: Zero Auth

**Priority:** Must Have

- Vercel SSO protection: preview only, production always public
- No login required

---

### NFR-004: Dependency Management via uv

**Priority:** Must Have

- `pyproject.toml` managed by uv
- `uv run python parse.py` works on any machine with uv installed
- openpyxl is the only added dependency

---

### NFR-005: Graceful Degradation

**Priority:** Should Have

- Missing MF data for a date range → gap shown in charts, not crash
- Missing Health Connect DB → cardio section shows "no cardio data"
- No uncaught JS errors under any data conditions

---

## Epics

---

### EPIC-001: Data Pipeline v2

**Description:**
New parser that reads MacroFactor XLSX as primary source, merges with Health Connect, outputs enriched `data.json`. Foundation for everything else.

**Functional Requirements:** FR-001, FR-017

**Story Count Estimate:** 2–3

**Priority:** Must Have

---

### EPIC-002: Body Composition Intelligence

**Description:**
BF% estimation, lean mass, FFMI, cut progress, TDEE tracking. The "are we keeping muscle?" layer.

**Functional Requirements:** FR-002, FR-003, FR-004, FR-005

**Story Count Estimate:** 3–4

**Priority:** Must Have

---

### EPIC-003: Training Volume Intelligence

**Description:**
Push/Pull/Upper/Lower indexes, 22-muscle heatmap, balance score — all from MF's pre-calculated muscle group data.

**Functional Requirements:** FR-006, FR-007, FR-008

**Story Count Estimate:** 3–4

**Priority:** Must Have

---

### EPIC-004: Progressive Overload & Recovery

**Description:**
Per-exercise weight/volume tracking, RIR trends, volume spike detection, cardio tracker. The "are we progressing safely?" layer.

**Functional Requirements:** FR-009, FR-010, FR-011, FR-012

**Story Count Estimate:** 3–4

**Priority:** Must Have (FR-009), Should Have (rest)

---

### EPIC-005: Coach Interface & Nutrition

**Description:**
Coach Brief card, two-view toggle, nutrition adherence using MF targets, correlation flags.

**Functional Requirements:** FR-013, FR-014, FR-015, FR-016

**Story Count Estimate:** 3–4

**Priority:** Must Have

---

## User Personas

**Benjamin (Athlete)** — daily user, wants all the detail, updates exports
**Coach** — 1–2×/week pre-session on mobile, wants 10-second summary

---

## User Flows

**Coach pre-session:** Open URL → Coach View → scan Brief → drill to Athlete View if flags

**Daily update:**
```bash
# Drop new MacroFactor export in drive_export/workout/
./update.sh
# → parses all XLSX + HC DB → git push → Vercel deploys
```

**Monthly:** Export MacroFactor for new month → drop in folder → run update

---

## Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| MacroFactor XLSX exports | Data | Monthly, manual export |
| Health Connect daily `.db` | Data | Secondary source |
| openpyxl | Python lib | Managed via uv |
| Chart.js CDN | Frontend | Already in use |
| Vercel | Hosting | Already configured |

---

## Assumptions

- MacroFactor exports include full workout log with weight, reps, RIR
- Monthly export cadence is acceptable (data not real-time)
- MF trend weight is more reliable than raw scale readings
- MF targets change over time — using MF-exported targets per day (not hardcoded)
- `drive_export/` stays local, never committed to git

---

## Out of Scope

- Real-time sync with MacroFactor API (no public API available)
- Individual food item nutritional deep-dives
- Sleep data
- Multi-user
- Auth/login
- Native app
- Strength Level integration (no benchmarking data structure planned yet)

---

## Open Questions

1. **Export frequency**: User exports MF monthly — is this sufficient or should we prompt for more frequent exports?
2. **Historical data**: Do we have MF exports going back to November 2025 (training start)? Currently only Jan + Feb.
3. **Waist measurement history**: Single value in config or can we track it over time?

---

## Stakeholders

- **Benjamin Trom** — approves, updates exports
- **Coach** — primary consumer of Coach View

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-26 | trom | Initial PRD (Health Connect primary) |
| 2.0 | 2026-02-26 | trom | MacroFactor as primary source, full data audit |

---

## Next Steps

1. Run `/architecture` — data model for merged MF + HC sources
2. Run `/sprint-planning` — ~15 stories across 5 epics

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**

---

## Appendix A: Traceability Matrix

| Epic | Name | FRs | Stories (Est.) |
|------|------|-----|----------------|
| EPIC-001 | Data Pipeline v2 | FR-001, FR-017 | 2–3 |
| EPIC-002 | Body Composition | FR-002, FR-003, FR-004, FR-005 | 3–4 |
| EPIC-003 | Volume Intelligence | FR-006, FR-007, FR-008 | 3–4 |
| EPIC-004 | Progressive Overload & Recovery | FR-009, FR-010, FR-011, FR-012 | 3–4 |
| EPIC-005 | Coach Interface & Nutrition | FR-013, FR-014, FR-015, FR-016 | 3–4 |

**Total: 17 FRs, 5 NFRs, 5 Epics, ~14–19 stories**

---

## Appendix B: Prioritisation

| Priority | FRs |
|----------|-----|
| Must Have | FR-001, FR-002, FR-003, FR-004, FR-006, FR-008, FR-009, FR-013, FR-015, FR-016, FR-017 (11) |
| Should Have | FR-005, FR-007, FR-010, FR-011, FR-012, FR-014 (6) |
