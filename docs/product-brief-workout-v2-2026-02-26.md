# Product Brief: workout v2 — Hypertrophy Intelligence Dashboard

**Date:** 2026-02-26
**Author:** trom (Benjamin Trom)
**Version:** 1.0
**Project Type:** web-app
**Project Level:** 2

---

## Executive Summary

A v2 overhaul of the workout dashboard, transforming it from a raw data viewer into a hypertrophy-focused coaching intelligence tool. The dashboard will surface synthetic training indexes (Push/Pull/Upper/Lower), lean mass tracking, BF% estimation from anthropometric formulas, progressive overload signals, and a coach-ready summary view — all designed for a 31M athlete on an aggressive cut with 7/7 training frequency and hypertrophy as the primary goal.

---

## Athlete Profile

| Metric | Value |
|--------|-------|
| Name | Benjamin Trom |
| Age | 31M |
| Height | 181 cm |
| Current weight | 107 kg |
| Waist | 100–102 cm |
| Scale BF% | Unreliable (poor scale) |
| Estimated BF% (formula) | ~20% (YMCA method) |
| Lean mass estimate | ~85–86 kg |
| FFMI | ~25.9 |
| Training since | November 2025 (~4 months) |
| Cut start | ~120 kg → 107 kg (−13 kg) |
| Caloric target | 2,300 kcal/day (~500 kcal deficit) |
| Protein target | 230 g/day (2.15 g/kg) |
| Training frequency | 7/7 (daily) |
| Training style | Full body, high intensity, failure/past-failure |
| Priority | Hypertrophy > Strength > VO2 > Cardio |
| VO2 sessions | Zone 4–5, 2×/week (2 min Z4 → 30 sec Z5, bike) |
| Padel | 2–3×/week |

---

## Problem Statement

### The Problem

The current v1 dashboard shows raw data (weight chart, generic workout log, macro totals) but provides no training intelligence. A coach reviewing this dashboard cannot answer the most important questions:

- Is Benjamin recovering enough between sessions? (volume landmarks)
- Is his push/pull ratio balanced? (injury risk)
- Is he actually building muscle or just losing weight? (lean mass vs fat mass)
- Is his nutrition supporting his training load? (calorie × volume correlation)
- Are his workouts progressing? (progressive overload signals)

The BF% from his scale is also unreliable — the dashboard shows noisy, inaccurate data that misleads rather than informs.

### Why Now?

The athlete is 4 months into a structured program and approaching a critical phase — the cut is progressing (−13 kg) and the risk of muscle loss increases as deficit deepens. This is exactly the point where data-driven coaching decisions matter most.

### Impact if Unsolved

Coach and athlete make decisions based on incomplete data. Overtraining goes undetected. BF% remains a guessing game. Push/pull imbalances develop silently. Progressive overload stalls aren't caught early.

---

## Target Audience

### Primary Users

- **Benjamin (athlete)** — reviews daily for self-monitoring, updates the dashboard with each new export
- **Coach** — reviews pre-session (1–2×/week) for programming decisions

### User Needs

1. **Coach needs a 10-second pre-session brief** — key metrics, flags, last week's training summary
2. **Athlete needs honest body composition data** — not noisy scale BF%, but formula-estimated lean mass trend
3. **Both need volume intelligence** — are we in the right training zone (MEV → MRV) for each muscle group?

---

## Solution Overview

### Proposed Solution

A two-layer dashboard:
- **Coach View** — one-screen weekly summary with traffic-light flags, designed to be scanned in 10 seconds
- **Athlete View** — full detail with all charts, indexes, session log, and progressive overload tracking

Data pipeline unchanged (Health Connect SQLite → `parse.py` → `data.json` → static site), but significantly enriched:
- Workout-to-muscle-group mapping via a config file (`workout-config.json`)
- BF% estimation via YMCA formula (waist + weight) to fill gaps in unreliable scale data
- Lean mass and FFMI calculated from weight + BF% estimate
- Synthetic training indexes calculated from weekly volume per muscle group

### Key Features

**Body Composition Intelligence:**
- Lean mass trend chart (weight × (1 − BF%)) — the real signal during a cut
- FFMI tracking (Fat-Free Mass Index = lean_kg / height_m²) — natty benchmark ~25
- BF% estimation via two methods:
  - YMCA formula: uses waist + weight (no neck needed)
  - Deurenberg formula: uses BMI + age
  - Show estimated range, flag when scale reading diverges >3%
- Cut progress tracker: 120 kg → target BF% 15%, projected date
- Body fat velocity (kg fat/week)

**Training Volume Indexes:**
- **Push Index** — chest + shoulders + triceps weekly sets vs MEV/MRV
- **Pull Index** — back + biceps weekly sets vs MEV/MRV
- **Upper Index** — total upper body weekly volume
- **Lower Index** — total lower body weekly volume
- **Push/Pull Balance Score** — ratio, red flag if >20% imbalanced
- **Weekly Volume Heatmap** — muscle group × week grid, colored by volume zone (below MEV / MEV–MAV / MAV–MRV / above MRV)

**Progressive Overload Tracker:**
- Total reps per workout type over time (Workout A–F)
- Weekly volume trend per workout label
- Flag: same or declining volume for 2+ consecutive weeks = stall
- PR highlights: sessions with highest total reps ever for that workout type

**Coach Brief (top of page):**
- Last weigh-in + 7-day weight trend
- Estimated lean mass (latest)
- 7-day protein adherence % (days hitting ≥200g)
- 7-day avg calories vs target
- This week's total sets by index (Push/Pull/Upper/Lower)
- Streak (consecutive training days)
- Active flags (overtraining risk, nutrition deficit, push/pull imbalance)

**Workout Config System:**
- `workout-config.json` in repo — maps Workout A–F to muscle groups
- Example: `"Workout A": { "push": true, "muscles": ["chest", "shoulders", "triceps"] }`
- Unlocks all volume-per-muscle-group analytics
- Editable without touching code

**Cardio & Recovery:**
- VO2 zone 4–5 minutes per week vs target (2 sessions)
- Padel session count (tagged from Health Connect session titles)
- Training load distribution: strength vs cardio vs sport
- 7/7 streak with weekly volume spike detector (>10% jump flagged)

**Nutrition × Training Correlation:**
- Flag days: calories <1,800 AND training volume above average = recovery risk
- Weekly protein adherence chart
- Deficit depth over time (weight loss rate implied)

### Value Proposition

The coach opens one URL, sees a traffic-light dashboard, and knows in 10 seconds whether Benjamin is training smart, recovering enough, and staying on track for his 15% BF target. No messages, no screenshots, no manual reporting.

---

## Business Objectives

### Goals

- Coach has actionable pre-session intelligence every time they open the URL
- Benjamin reaches 15% BF while maximizing lean mass retention
- Overtraining and push/pull imbalances are caught before they cause injury or stalls
- Dashboard is v2-ready before the next coaching session

### Success Metrics

- Coach can answer "how is training going this week?" in <10 seconds from the dashboard
- Lean mass chart shows stable or increasing lean mass as weight drops
- Push/Pull balance score stays within 80–120% range
- BF% estimation within ±2% of DEXA when eventually measured

### Business Value

Better coaching = faster progress toward the 15% BF target with minimal muscle loss. Data visibility replaces guesswork.

---

## Scope

### In Scope

- Coach View + Athlete View toggle
- BF% estimation (YMCA + Deurenberg formulas, fill gaps in scale data)
- Lean mass + FFMI charts
- Push/Pull/Upper/Lower synthetic indexes
- Volume heatmap (muscle group × week)
- Progressive overload tracker (reps/volume per workout type over time)
- Coach Brief card (top of page, all key metrics)
- Workout config system (`workout-config.json`)
- Push/Pull balance score with red flag
- Weekly nutrition adherence (protein % days, avg calories)
- Cardio tracker (zone 4-5 minutes, padel sessions)
- Volume spike detector (overtraining flag)
- Cut progress tracker (start → current → target)

### Out of Scope

- Individual exercise name tracking (not available in Health Connect from Myoadapt)
- RPE/RIR tracking (not in Health Connect data)
- Sleep data (sparse/unreliable in current export)
- Multi-user support
- Auth/login
- Push notifications
- Native mobile app

### Future Considerations

- Neck measurement input → enable US Navy BF% formula (more accurate)
- Manual exercise log overlay (user enters exercises separately)
- Deload week auto-detection
- HRV-based readiness score
- Photo progress timeline
- Periodization planning overlay

---

## Key Stakeholders

- **Benjamin Trom (Owner/Athlete)** — High influence. Builds, maintains, primary data source.
- **Coach** — Medium influence. Primary consumer of Coach View; feedback drives what gets surfaced.

---

## Constraints and Assumptions

### Constraints

- No individual exercise names available from Health Connect (Myoadapt limitation)
- Workout A–F muscle group mapping must be manually configured
- Free hosting (Vercel), static site only
- BF% from scale is unreliable → formula estimation is the fallback

### Assumptions

- Waist measurement available and updated periodically (needed for YMCA formula)
- Workout A–F labels are consistent (Myoadapt uses same names)
- MEV/MRV landmarks used are general evidence-based ranges (not personalized)
  - Example: Chest MEV = 8 sets/week, MRV = 20 sets/week
- Push/Pull defined as: Push = chest + shoulders + triceps; Pull = back + biceps
- Daily training at 7/7 means rest days are rare — volume per week is the key fatigue metric

---

## Success Criteria

- [ ] Coach can read the full weekly summary in <10 seconds
- [ ] Lean mass chart shows clear trend (not noisy like scale BF%)
- [ ] FFMI tracked and coach can see if muscle is being built or lost
- [ ] Push/Pull balance visible with clear flag when imbalanced
- [ ] BF% estimation fills the gaps where scale data is missing or noisy
- [ ] Cut progress (120 kg → 15% BF) visualized with projected date
- [ ] Volume heatmap shows which muscle groups are under/over-trained

---

## Timeline

**Target:** ASAP — before next coaching session

**Milestones:**
- Day 1: Parser v2 (BF% estimation, lean mass, workout config, volume per muscle group)
- Day 2: Coach Brief card + redesigned overview
- Day 3: Index charts (Push/Pull/Upper/Lower), volume heatmap
- Day 4: Progressive overload tracker, nutrition flags
- Day 5: Polish, deploy, coach review

---

## Risks & Mitigation

- **Risk:** Workout A–F muscle group mapping is wrong → all volume indexes are wrong
  - **Likelihood:** Medium
  - **Mitigation:** Make config editable, show raw data alongside indexes so errors are obvious

- **Risk:** BF% formula estimation diverges significantly from reality
  - **Likelihood:** Medium
  - **Mitigation:** Show both formulas + range, label clearly as "estimated", recommend DEXA for ground truth

- **Risk:** MEV/MRV landmarks don't match athlete's actual capacity
  - **Likelihood:** Medium
  - **Mitigation:** Make landmarks configurable in `workout-config.json`; use conservative defaults

- **Risk:** Scale BF% data is so noisy it pollutes lean mass chart
  - **Likelihood:** High (already confirmed)
  - **Mitigation:** Use formula-estimated BF% as primary; show scale BF% as secondary/optional overlay

---

## Notes

**BF% Estimation Formulas (for parser implementation):**

YMCA (men, metric):
```
waist_cm, weight_kg
weight_lb = weight_kg × 2.205
waist_in  = waist_cm / 2.54
bf_pct    = ((-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb) × 100
```

Deurenberg (BMI-based):
```
bmi    = weight_kg / (height_m²)
bf_pct = (1.20 × bmi) + (0.23 × age) - (10.8 × 1) - 5.4   # sex=1 for male
```

Lean mass + FFMI:
```
lean_kg = weight_kg × (1 - bf_pct/100)
ffmi    = lean_kg / (height_m²)
```

---

## Next Steps

1. Run `/prd` — full product requirements with epics and FRs
2. Run `/architecture` — data model changes (workout config, BF estimation, volume indexes)
3. Run `/sprint-planning` — ~12-15 stories for v2

---

**This document was created using BMAD Method v6 - Phase 1 (Analysis)**

*To continue: Run `/prd` for full requirements.*
