# Product Requirements Document: workout v2

**Date:** 2026-02-26
**Author:** trom
**Version:** 1.0
**Project Type:** web-app
**Project Level:** 2
**Status:** Draft

---

## Document Overview

This PRD defines requirements for the workout dashboard v2 — a hypertrophy-focused coaching intelligence tool built on top of the existing Health Connect export pipeline. It serves as the source of truth for what will be built.

**Related Documents:**
- Product Brief: `docs/product-brief-workout-v2-2026-02-26.md`
- v1 Tech Spec: `docs/tech-spec-workout-2026-02-26.md`

---

## Executive Summary

Transform the existing workout dashboard from a raw data viewer into a coaching intelligence platform. V2 adds body composition estimation, synthetic training volume indexes (Push/Pull/Upper/Lower), progressive overload tracking, and a coach-optimized summary view — all data-driven from the existing Health Connect pipeline with zero new infrastructure.

---

## Product Goals

### Business Objectives

- Coach can assess Benjamin's full training status in <10 seconds from one URL
- Benjamin reaches 15% BF while maximising lean mass retention during the cut
- Overtraining, imbalances, and progressive overload stalls are detected before they cause harm
- All insights derived automatically — zero manual reporting after daily DB export

### Success Metrics

- Coach can answer "how is training going this week?" in <10 seconds
- Lean mass is stable or increasing as total weight drops
- Push/Pull balance score stays within 80–120% range
- BF% estimation within ±3% of any future DEXA measurement
- Progressive overload stalls flagged within 2 weeks of onset

---

## Functional Requirements

---

### FR-001: BF% Estimation Engine

**Priority:** Must Have

**Description:**
The parser calculates estimated BF% for every weight entry using two formulas:
- **YMCA** (waist + weight): `bf = ((-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb) × 100`
- **Deurenberg** (BMI + age): `bf = (1.20 × bmi) + (0.23 × age) - (10.8 × 1) - 5.4`

Athlete profile (age, height, waist) stored in `workout-config.json`. Parser outputs both estimates alongside scale BF% (where available) in `data.json`.

**Acceptance Criteria:**
- [ ] Parser reads `athlete.age`, `athlete.height_cm`, `athlete.waist_cm` from `workout-config.json`
- [ ] YMCA and Deurenberg BF% calculated for every weight entry
- [ ] Both estimates output in `data.json` alongside scale reading
- [ ] If waist not provided, YMCA is skipped gracefully
- [ ] Spot check: at 107 kg / 101 cm waist → YMCA gives ~20%

**Dependencies:** FR-006 (config system)

---

### FR-002: Lean Mass Trend Chart

**Priority:** Must Have

**Description:**
Dashboard displays a lean mass trend line calculated as `lean_kg = weight_kg × (1 - bf_pct/100)` using the formula-estimated BF%. This is the primary body composition signal during a cut — weight can drop from fat or muscle, lean mass separates the two.

**Acceptance Criteria:**
- [ ] Lean mass calculated from formula-estimated BF% (not noisy scale BF%)
- [ ] Lean mass trend line shown alongside total weight on body composition chart
- [ ] Y-axis shows both weight (kg) and lean mass (kg) with clear labels
- [ ] Last lean mass value shown prominently on Coach Brief card
- [ ] Trend direction annotated (up/stable/down with colour)

**Dependencies:** FR-001

---

### FR-003: FFMI Tracking

**Priority:** Should Have

**Description:**
Fat-Free Mass Index (FFMI = lean_kg / height_m²) tracked over time. Provides a height-normalised lean mass metric. Natural athlete benchmark: ~25. Shown as a secondary chart on the body composition page.

**Acceptance Criteria:**
- [ ] FFMI calculated for every data point with a lean mass value
- [ ] FFMI chart shown on Athlete View body composition section
- [ ] Reference lines drawn at 22 (average), 25 (genetic ceiling estimate), 28 (elite)
- [ ] Current FFMI shown in Coach Brief

**Dependencies:** FR-001, FR-002

---

### FR-004: Cut Progress Tracker

**Priority:** Must Have

**Description:**
Visual progress indicator showing the cut journey: start weight (120 kg) → current weight → target (15% BF). Projected completion date estimated from last 30-day weight loss rate.

**Acceptance Criteria:**
- [ ] Start weight, current weight, target BF% loaded from `workout-config.json`
- [ ] Progress bar: start → current → projected target weight at 15% BF
- [ ] Projected target weight calculated: `lean_mass / (1 - 0.15)`
- [ ] Rate of loss calculated from last 30 days (kg/week)
- [ ] Projected completion date shown (with caveat label "estimated")
- [ ] Total kg lost shown alongside kg remaining

**Dependencies:** FR-001, FR-002

---

### FR-005: BF% Comparison View

**Priority:** Could Have

**Description:**
Optional overlay showing scale BF% vs YMCA estimate vs Deurenberg estimate on a single chart, allowing coach and athlete to assess scale reliability.

**Acceptance Criteria:**
- [ ] Three BF% lines on one chart (scale, YMCA, Deurenberg)
- [ ] Scale BF% shown as dotted/lighter line to indicate lower reliability
- [ ] Gap between scale and formula highlighted when divergence >3%

**Dependencies:** FR-001

---

### FR-006: Workout Config System

**Priority:** Must Have

**Description:**
A `workout-config.json` file in the repo root stores all user-configurable parameters: athlete profile, workout-to-muscle-group mapping, MEV/MRV landmarks. This unlocks all volume-based analytics without requiring code changes.

**Acceptance Criteria:**
- [ ] `workout-config.json` created with schema for athlete profile and workout mapping
- [ ] Supports mapping each workout label (A–F) to: push/pull/upper/lower flags + muscle group list
- [ ] Supports per-muscle-group MEV and MRV values (defaults provided)
- [ ] Parser reads config at runtime; fails with clear error if config missing
- [ ] Example config committed to repo with sensible defaults for Benjamin's programme

**Schema (minimum):**
```json
{
  "athlete": {
    "name": "Benjamin Trom",
    "age": 31,
    "height_cm": 181,
    "sex": "male",
    "waist_cm": 101,
    "cut_start_kg": 120,
    "target_bf_pct": 15
  },
  "workouts": {
    "Workout A": { "push": true, "pull": false, "upper": true, "lower": false, "muscles": ["chest","shoulders","triceps"] }
  },
  "landmarks": {
    "chest":      { "mev": 8,  "mav": 14, "mrv": 20 },
    "back":       { "mev": 10, "mav": 16, "mrv": 22 },
    "shoulders":  { "mev": 8,  "mav": 14, "mrv": 20 },
    "biceps":     { "mev": 6,  "mav": 10, "mrv": 16 },
    "triceps":    { "mev": 6,  "mav": 10, "mrv": 16 },
    "quads":      { "mev": 8,  "mav": 14, "mrv": 20 },
    "hamstrings": { "mev": 6,  "mav": 10, "mrv": 16 },
    "glutes":     { "mev": 6,  "mav": 10, "mrv": 16 }
  }
}
```

---

### FR-007: Push / Pull / Upper / Lower Indexes

**Priority:** Must Have

**Description:**
Four synthetic weekly volume indexes calculated from workout sessions × muscle group config. Each index = total sets in that category for the current ISO week. Displayed as score cards with colour coding relative to MEV/MRV landmarks.

**Volume zones:**
- 🔵 Below MEV — under-training
- 🟢 MEV → MAV — optimal
- 🟡 MAV → MRV — high, monitor
- 🔴 Above MRV — overtraining risk

**Acceptance Criteria:**
- [ ] Parser outputs weekly volume per muscle group and per index (push/pull/upper/lower) in `data.json`
- [ ] Dashboard shows 4 index cards: Push, Pull, Upper, Lower
- [ ] Each card shows: sets this week, zone colour, vs last week delta
- [ ] Weekly index history available as a line chart (last 8 weeks)
- [ ] Indexes only calculated for workout labels present in `workout-config.json`

**Dependencies:** FR-006

---

### FR-008: Weekly Volume Heatmap

**Priority:** Should Have

**Description:**
A grid visualisation: rows = muscle groups, columns = calendar weeks, cell colour = volume zone (below MEV / optimal / high / overtraining). Allows coach and athlete to spot systematic imbalances or gaps at a glance.

**Acceptance Criteria:**
- [ ] Grid shows last 8 weeks × all configured muscle groups
- [ ] Cell colour matches volume zones from FR-007
- [ ] Cell tooltip on hover shows exact set count
- [ ] Muscle groups with zero data for a week shown as grey (not white, to distinguish from "not configured")

**Dependencies:** FR-006, FR-007

---

### FR-009: Push / Pull Balance Score

**Priority:** Must Have

**Description:**
Weekly ratio of Push sets to Pull sets. Displayed as a percentage and flagged when outside 80–120% range (i.e., push volume is less than 80% or more than 120% of pull volume).

**Acceptance Criteria:**
- [ ] Balance score = (push_sets / pull_sets) × 100, shown as e.g. "Push: 105%"
- [ ] Green when 80–120%, yellow when 70–80% or 120–130%, red outside that
- [ ] Score shown on Coach Brief card
- [ ] 8-week balance trend shown as a chart on Athlete View

**Dependencies:** FR-007

---

### FR-010: Configurable MEV/MRV Landmarks

**Priority:** Should Have

**Description:**
MEV, MAV, and MRV values per muscle group are read from `workout-config.json` rather than hardcoded. Defaults are evidence-based but the coach or athlete can tune them to match actual recovery capacity.

**Acceptance Criteria:**
- [ ] Parser uses landmarks from config for volume zone calculations
- [ ] Defaults shipped in repo config cover all standard muscle groups
- [ ] Changing a value in config and re-running parser updates all zone calculations
- [ ] Dashboard shows the applicable landmarks on volume charts as reference lines

**Dependencies:** FR-006

---

### FR-011: Progressive Overload Tracker

**Priority:** Must Have

**Description:**
For each workout label (A–F), track total weekly reps over time. Highlight personal bests (highest total reps in a single session for that workout type). Flag when the same or lower volume appears for 2+ consecutive weeks.

**Acceptance Criteria:**
- [ ] Parser calculates total reps per session per workout label
- [ ] Weekly volume (total reps) per workout label output in `data.json`
- [ ] Line chart per workout label showing weekly reps over last 8 weeks
- [ ] Sessions that are all-time PRs highlighted in accent colour
- [ ] Stall flag shown when volume ≤ previous week for 2 consecutive weeks
- [ ] Stall flags visible on Coach Brief if any workout is stalling

**Dependencies:** None

---

### FR-012: Volume Spike Detector

**Priority:** Should Have

**Description:**
Flag when any single week's total training volume (all sets across all sessions) exceeds the prior 4-week average by more than 20%. Acute:chronic workload ratio spike = injury risk, especially relevant for 7/7 training.

**Acceptance Criteria:**
- [ ] Parser calculates rolling 4-week average total sets
- [ ] Current week flagged if >120% of rolling average
- [ ] Flag shown on Coach Brief as "⚠ Volume spike this week"
- [ ] Historical spike weeks marked on volume trend chart

**Dependencies:** None

---

### FR-013: Cardio & Sport Tracker

**Priority:** Should Have

**Description:**
Track VO2-type sessions (bike, zone 4–5) and padel sessions separately from strength sessions. Show weekly count vs targets (VO2: 2×/week; Padel: 2–3×/week).

**Acceptance Criteria:**
- [ ] Sessions classified as: strength, cardio/VO2, padel, or other — based on `exercise_type` and session title keywords
- [ ] Weekly count per category shown on Coach Brief and Athlete View
- [ ] VO2 session count vs target (2/week) shown with green/red indicator
- [ ] Padel session count shown
- [ ] Training load distribution chart (strength vs cardio vs sport % of weekly sessions)

**Dependencies:** None

---

### FR-014: Nutrition × Training Correlation Flag

**Priority:** Should Have

**Description:**
Flag calendar days where caloric intake was below 1,800 kcal AND training volume was above the 30-day average. These days represent elevated recovery risk.

**Acceptance Criteria:**
- [ ] Parser identifies and flags recovery risk days in `data.json`
- [ ] Flagged days shown as highlighted points on nutrition chart
- [ ] Count of recovery risk days in last 7 days shown on Coach Brief
- [ ] Threshold values (1,800 kcal, volume multiplier) configurable in `workout-config.json`

**Dependencies:** FR-006

---

### FR-015: Coach Brief Card

**Priority:** Must Have

**Description:**
A pinned summary section at the top of the dashboard, visible without scrolling. Designed to be read in <10 seconds. Contains the most critical weekly metrics and active flags.

**Contents:**
- Latest weight + 7-day trend (↑/↓/→ + kg delta)
- Estimated lean mass (latest, from formula BF%)
- Current FFMI
- Training streak (consecutive days)
- This week: Push / Pull / Upper / Lower set counts with zone colours
- Push/Pull balance score
- 7-day protein adherence (% days ≥ 200g)
- 7-day average calories vs 2,300 target
- Active flags: volume spike / stall / imbalance / recovery risk

**Acceptance Criteria:**
- [ ] Coach Brief visible at top of page on all screen sizes without scrolling
- [ ] All metrics update from `data.json` — no hardcoded values
- [ ] Flags shown as colour-coded pills (🟢 / 🟡 / 🔴)
- [ ] Loads and renders in <1 second
- [ ] Looks clean and professional on mobile (coach may view on phone)

**Dependencies:** FR-001, FR-002, FR-007, FR-009, FR-011, FR-012, FR-013, FR-014

---

### FR-016: Coach View / Athlete View Toggle

**Priority:** Must Have

**Description:**
Two distinct views accessible via a toggle at the top of the page.

- **Coach View:** Coach Brief card + weekly index summary + cut progress + active flags. One screen, no scrolling required.
- **Athlete View:** Full dashboard with all charts, workout log, nutrition detail, heatmap, progressive overload charts.

**Acceptance Criteria:**
- [ ] Toggle button clearly labelled "Coach" / "Athlete" at top of page
- [ ] Coach View shows only Coach Brief card + index summary + cut progress + flags
- [ ] Athlete View shows full existing dashboard plus all v2 additions
- [ ] Default view is Coach View
- [ ] Toggle state persists in `localStorage` for returning visitors

**Dependencies:** FR-015

---

### FR-017: Weekly Nutrition Adherence Charts

**Priority:** Should Have

**Description:**
Expand existing nutrition charts to include adherence tracking: % of days hitting protein target (≥200g) and calorie target (within ±200 kcal of 2,300).

**Acceptance Criteria:**
- [ ] 30-day protein adherence % shown as a score (e.g. "87% of days hit ≥200g protein")
- [ ] Calendar heatmap or bar chart showing which days hit/missed protein target
- [ ] 7-day and 30-day averages shown for calories and protein
- [ ] Targets read from `workout-config.json`

**Dependencies:** FR-006

---

## Non-Functional Requirements

---

### NFR-001: Performance

**Priority:** Must Have

**Description:** Dashboard renders fully in <3 seconds on a 4G mobile connection.

**Acceptance Criteria:**
- [ ] `data.json` remains under 500 KB after v2 parser additions
- [ ] All charts render within 1 second of `data.json` load
- [ ] No blocking network requests other than `data.json` and Chart.js CDN

---

### NFR-002: Mobile Usability

**Priority:** Must Have

**Description:** Dashboard is fully usable on mobile — coach will frequently view on phone before sessions.

**Acceptance Criteria:**
- [ ] Coach Brief card readable without zooming on iPhone 12 screen width (390px)
- [ ] All charts legible on mobile (labels not overlapping, touch-friendly tooltips)
- [ ] No horizontal scrolling on mobile

---

### NFR-003: Zero Auth

**Priority:** Must Have

**Description:** Dashboard is fully public — no Vercel auth, no login, no token. Anyone with the URL can view it.

**Acceptance Criteria:**
- [ ] Vercel SSO protection set to "preview only" (production always public)
- [ ] No auth headers required to load `data.json`

---

### NFR-004: Config-Driven Customisation

**Priority:** Must Have

**Description:** Key parameters (athlete profile, workout mapping, targets, thresholds) are set in `workout-config.json` — no code changes required for routine adjustments.

**Acceptance Criteria:**
- [ ] Changing waist measurement in config updates all BF% estimates on next parse
- [ ] Adding a new workout label in config immediately includes it in volume indexes
- [ ] Changing a MEV/MRV value updates volume zone colours on next parse

---

### NFR-005: No External Runtime Dependencies

**Priority:** Must Have

**Description:** Parser (`parse.py`) runs on any machine with Python 3.11+ and standard library only. No `pip install` required.

**Acceptance Criteria:**
- [ ] `python3 parse.py` works on a fresh machine with no dependencies installed
- [ ] `workout-config.json` path is relative — works from any directory

---

### NFR-006: Graceful Degradation

**Priority:** Should Have

**Description:** If workout config is missing or incomplete, dashboard still renders with available data and shows clear "config required" messages rather than crashing.

**Acceptance Criteria:**
- [ ] Missing workout mapping → volume indexes show "Configure workouts in workout-config.json"
- [ ] Missing waist measurement → BF% estimation skipped, scale BF% used as fallback
- [ ] No uncaught JS errors in browser console under any data conditions

---

## Epics

---

### EPIC-001: Body Composition Intelligence

**Description:**
Everything needed to track true body composition during the cut — replacing unreliable scale BF% with formula-estimated lean mass, FFMI, and cut progress visualisation.

**Functional Requirements:**
- FR-001: BF% Estimation Engine
- FR-002: Lean Mass Trend Chart
- FR-003: FFMI Tracking
- FR-004: Cut Progress Tracker
- FR-005: BF% Comparison View

**Story Count Estimate:** 3–4

**Priority:** Must Have

**Business Value:**
During a cut, weight alone is misleading. Lean mass tracking tells the coach whether the athlete is losing fat or muscle — the most important decision-driving signal in the programme.

---

### EPIC-002: Training Volume Intelligence

**Description:**
Workout config system + synthetic indexes + heatmap + balance score. Transforms raw session data into actionable volume analytics mapped to evidence-based MEV/MRV landmarks.

**Functional Requirements:**
- FR-006: Workout Config System
- FR-007: Push / Pull / Upper / Lower Indexes
- FR-008: Weekly Volume Heatmap
- FR-009: Push / Pull Balance Score
- FR-010: Configurable MEV/MRV Landmarks

**Story Count Estimate:** 4–5

**Priority:** Must Have

**Business Value:**
Without knowing which muscle groups are trained each session, all volume analytics are impossible. This epic is the foundation for all training intelligence in v2.

---

### EPIC-003: Overload, Recovery & Cardio

**Description:**
Progressive overload signals, recovery risk flags, volume spike detection, and cardio/sport tracking. The "safety and progress" layer.

**Functional Requirements:**
- FR-011: Progressive Overload Tracker
- FR-012: Volume Spike Detector
- FR-013: Cardio & Sport Tracker
- FR-014: Nutrition × Training Correlation Flag

**Story Count Estimate:** 3–4

**Priority:** Should Have

**Business Value:**
7/7 training with a caloric deficit is high-risk for overtraining and muscle loss. This epic provides the early-warning system the coach needs to intervene before damage is done.

---

### EPIC-004: Coach Interface

**Description:**
Coach Brief card, two-view toggle, and enhanced nutrition adherence — the presentation layer that makes all the analytics accessible in <10 seconds.

**Functional Requirements:**
- FR-015: Coach Brief Card
- FR-016: Coach View / Athlete View Toggle
- FR-017: Weekly Nutrition Adherence Charts

**Story Count Estimate:** 3–4

**Priority:** Must Have

**Business Value:**
Data is only useful if it's seen. The coach needs a frictionless, mobile-friendly view that surfaces the right information instantly before every session.

---

## User Stories (High-Level)

**EPIC-001:**
- As Benjamin, I want to see my lean mass trend so I know if I'm losing fat or muscle during the cut
- As the coach, I want to see current FFMI so I can assess muscle development relative to Benjamin's frame
- As Benjamin, I want a projected date for reaching 15% BF based on my current rate of loss

**EPIC-002:**
- As the coach, I want to see Push/Pull/Upper/Lower sets this week vs MEV/MRV so I can assess training balance
- As Benjamin, I want a volume heatmap so I can see which muscle groups I've been neglecting
- As the coach, I want a Push/Pull balance score so I can catch shoulder imbalances early

**EPIC-003:**
- As the coach, I want to see if any workout type is stalling (same reps 2+ weeks) so I can adjust programming
- As Benjamin, I want a volume spike flag so I can catch overtraining before injury
- As the coach, I want to see VO2 session count vs target to ensure cardio programming is on track

**EPIC-004:**
- As the coach, I want a single-screen summary I can read in 10 seconds before a session
- As Benjamin, I want to toggle between coach view and full athlete view
- As the coach, I want to see protein adherence % so I know if nutrition is the limiting factor

---

## User Personas

**Benjamin (Athlete, Primary)**
- 31M, 181 cm, 107 kg
- Daily user — updates dashboard and monitors own progress
- Wants granular detail: every chart, all history, PRs highlighted
- Comfortable with data and technology

**Coach (Secondary)**
- Reviews 1–2×/week pre-session, likely on mobile
- Wants high-level summary only — flags, trends, weekly numbers
- Does not want to dig through tabs or scroll through logs
- Decision-driven: "should I change the programme this week?"

---

## User Flows

**Flow 1: Pre-session coach check (Coach View)**
1. Open URL → Coach View loads by default
2. Scan Coach Brief card: weight trend, lean mass, indexes, flags
3. If any flags active → drill into Athlete View for context
4. Walk into session with full picture

**Flow 2: Daily athlete update**
1. Export `.db` from Health Connect
2. Run `./update.sh /path/to/health_connect_export.db`
3. Open dashboard → verify data looks correct
4. Check if any new PRs or flags

**Flow 3: Config update (new workout added)**
1. Edit `workout-config.json`, add new workout label with muscle groups
2. Run `python3 parse.py` → volume indexes now include new workout
3. `git push` → dashboard updates

---

## Dependencies

### Internal Dependencies

- v1 `parse.py` — will be extended (not replaced)
- v1 `public/app.js` — will be refactored to support two views
- `public/data.json` — schema extended; backwards compatible

### External Dependencies

- Health Connect daily export (manual trigger)
- Chart.js CDN (already in use)
- Vercel (deployment, already configured)
- GitHub (source, already configured)

---

## Assumptions

- Workout A–F labels are stable in Myoadapt (same name = same workout type)
- Waist measurement will be updated in config periodically (at least monthly)
- Coach is happy with URL-based access, no desire for login/auth
- MEV/MRV evidence-based defaults are acceptable starting points; coach will tune if needed
- Health Connect export continues to use the same SQLite schema

---

## Out of Scope

- Individual exercise name tracking (not available in Health Connect via Myoadapt)
- RPE / RIR tracking
- Sleep data
- Multi-user support / auth
- Push notifications
- Native mobile app
- HRV-based readiness score (future)
- Photo timeline (future)

---

## Open Questions

1. **What are the actual muscle groups for Workouts A–F?** Config will need to be populated before volume indexes work. Benjamin to complete `workout-config.json` with actual programme details.
2. **What is the current waist measurement?** Brief states 100–102 cm — use 101 cm as default in config.
3. **Should Padel count toward weekly training volume?** Currently excluded from strength volume — treat as active recovery unless coach says otherwise.

---

## Stakeholders

- **Benjamin Trom (Owner)** — approves requirements, populates workout config
- **Coach** — primary end-user of Coach View; provides feedback post-launch

### Approval Status

- [ ] Benjamin (Product Owner)
- [ ] Coach (end-user review)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-26 | trom | Initial PRD for v2 |

---

## Next Steps

### Phase 3: Architecture
Run `/architecture` to design the v2 data model, config schema, and parser changes.

### Phase 4: Sprint Planning
After architecture, run `/sprint-planning` to break epics into ~13–15 stories.

---

**This document was created using BMAD Method v6 - Phase 2 (Planning)**

*To continue: Run `/architecture` or `/workflow-status`.*

---

## Appendix A: Requirements Traceability Matrix

| Epic ID | Epic Name | Functional Requirements | Story Count (Est.) |
|---------|-----------|-------------------------|-------------------|
| EPIC-001 | Body Composition Intelligence | FR-001, FR-002, FR-003, FR-004, FR-005 | 3–4 |
| EPIC-002 | Training Volume Intelligence | FR-006, FR-007, FR-008, FR-009, FR-010 | 4–5 |
| EPIC-003 | Overload, Recovery & Cardio | FR-011, FR-012, FR-013, FR-014 | 3–4 |
| EPIC-004 | Coach Interface | FR-015, FR-016, FR-017 | 3–4 |

**Total estimated stories: 13–17**

---

## Appendix B: Prioritization Details

| Priority | FRs | NFRs |
|----------|-----|------|
| Must Have | FR-001, FR-002, FR-004, FR-006, FR-007, FR-009, FR-011, FR-015, FR-016 (9) | NFR-001, NFR-002, NFR-003, NFR-004, NFR-005 (5) |
| Should Have | FR-003, FR-008, FR-010, FR-012, FR-013, FR-014, FR-017 (7) | NFR-006 (1) |
| Could Have | FR-005 (1) | — |

**Total: 17 FRs, 6 NFRs, 4 Epics**
