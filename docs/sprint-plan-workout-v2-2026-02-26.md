# Sprint Plan: workout v2

**Date:** 2026-02-26
**Scrum Master:** trom
**Project Level:** 2
**Total Stories:** 10
**Total Points:** 49
**Planned Sprints:** 4

---

## Executive Summary

V2 transforms the dashboard into a hypertrophy coaching intelligence platform using MacroFactor XLSX as the primary data source. The plan delivers in four 1-week sprints: foundation parser → body composition → training volume → progressive overload + coach interface. All computation happens in the Python parser; the dashboard is a pure renderer.

**Key Metrics:**
- Total Stories: 10
- Total Points: 49
- Sprints: 4 (1-week each)
- Team Capacity: ~15 points/sprint (1 senior dev × 5 days × 6h productive ÷ 2h per point)
- Target Completion: ~4 weeks from start

---

## Story Inventory

---

### STORY-201: MacroFactor XLSX Reader + Athlete Config

**Epic:** EPIC-001 — Data Pipeline v2
**Priority:** Must Have
**Points:** 8

**User Story:**
As an athlete,
I want the parser to read all my MacroFactor XLSX exports automatically,
So that I never need to configure file paths or columns manually.

**Acceptance Criteria:**
- [ ] Auto-discovers all `MacroFactor-*.xlsx` in `drive_export/workout/`
- [ ] Parses Quick Export sheet: Date, TDEE, Trend Weight, Weight, Calories, Protein, Fat, Carbs, Target Calories, Target Protein, Steps
- [ ] Parses Workout Log sheet: Date, Workout, Exercise (strips `∈ SS1`-style suffixes), Weight (kg), Reps, RIR, Set Type
- [ ] Parses Muscle Groups - Sets sheet: Date + 22 muscle group columns
- [ ] Parses Muscle Groups - Volume sheet: Date + 22 muscle group columns
- [ ] Merges all files chronologically; deduplicates overlapping dates (latest file wins)
- [ ] `workout-config.json` created with athlete profile: `age=31, height_cm=181, waist_cm=101, start_weight_kg=120, target_bf_pct=15`
- [ ] MEV/MRV defaults in config: Push MEV=16/MRV=24, Pull MEV=16/MRV=24, Upper MEV=32/MRV=48, Lower MEV=16/MRV=24 (sets/week)
- [ ] Outputs structured `public/data.json` with all parsed sections
- [ ] Runs clean via `uv run python parse.py`

**Technical Notes:**
- Fully replaces existing `parse.py` (Health Connect-only)
- Use openpyxl `read_only=True` for performance
- Exercise name cleaning: strip superset suffixes like `∈ SS1`, `∈ SS2`
- Store MF data under `data["mf_daily"]`, `data["workouts"]`, `data["muscle_sets"]`, `data["muscle_volume"]`

**Dependencies:** None (first story)

---

### STORY-202: Health Connect Integration + update.sh v2

**Epic:** EPIC-001 — Data Pipeline v2
**Priority:** Must Have
**Points:** 3

**User Story:**
As an athlete,
I want cardio sessions and fallback weight data from Health Connect merged automatically,
So that one script gives me a complete picture.

**Acceptance Criteria:**
- [ ] Existing HC parser code (weight, body_fat, cardio/VO2/padel) integrated into new `parse.py`
- [ ] HC weight used as fallback for dates missing MF weight data
- [ ] Scale BF% from HC stored separately (not used for estimates — labelled "scale_bf_pct")
- [ ] Cardio sessions from HC classified: VO2 bike (exercise type `biking` or title contains "VO2"), Padel (title contains "padel")
- [ ] `update.sh` updated: just runs `uv run python parse.py` (no DB path arg needed; default `./health_connect_export.db`)
- [ ] `drive_export/` confirmed in `.gitignore`
- [ ] README updated with new workflow instructions

**Technical Notes:**
- HC DB path: configurable via env var `HC_DB_PATH`, default `./health_connect_export.db`
- If HC DB not found, cardio section shows empty array — no crash

**Dependencies:** STORY-201

---

### STORY-203: BF% Estimation Engine + Lean Mass + FFMI Dashboard

**Epic:** EPIC-002 — Body Composition Intelligence
**Priority:** Must Have
**Points:** 5

**User Story:**
As a coach,
I want to see reliable body composition estimates (not noisy scale BF%),
So that I can assess if muscle is being preserved during the cut.

**Acceptance Criteria:**
- [ ] Parser computes YMCA BF% for each weight entry: `bf = ((-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb) × 100` (waist from config, converted to inches; weight converted to lbs)
- [ ] Parser computes Deurenberg BF%: `bf = (1.20 × bmi) + (0.23 × age) - (10.8) - 5.4` (bmi from weight_kg and height_m from config)
- [ ] Average of two estimates used as `estimated_bf_pct`
- [ ] Spot check: 107 kg / 101 cm waist → YMCA ≈ 18–22%, Deurenberg ~25–28%; averaged ~22–25%
- [ ] Lean mass: `lean_kg = weight_kg × (1 - estimated_bf_pct / 100)` (using MF trend weight)
- [ ] FFMI: `ffmi = lean_kg / (height_m ** 2)`
- [ ] All values stored per date in `data.json` under `body_comp` array
- [ ] Dashboard body comp chart: MF trend weight + lean mass lines on same axis
- [ ] FFMI sub-chart with reference lines at 22 / 25 / 28
- [ ] Current lean mass, FFMI, and BF% shown in summary cards
- [ ] Trend labels: ↑ building / → maintaining / ↓ losing (based on 7-day delta)

**Technical Notes:**
- Use MF trend weight (smoother) for all body comp calculations
- Scale BF% stored separately as `scale_bf_pct` — shown as grey reference line, not primary
- Config waist value used for all historical calculations (no time-series waist data)

**Dependencies:** STORY-201

---

### STORY-204: Cut Progress Tracker + TDEE / Energy Balance

**Epic:** EPIC-002 — Body Composition Intelligence
**Priority:** Must Have
**Points:** 5

**User Story:**
As a coach,
I want to see cut progress to target and the actual energy deficit each day,
So that I can detect if the deficit is too aggressive (muscle loss risk).

**Acceptance Criteria:**
- [ ] Target weight: `target_kg = lean_mass_kg / (1 - 0.15)` computed by parser using latest lean mass and config `target_bf_pct=15`
- [ ] Rate of loss: slope of MF trend weight over last 30 days (linear regression or simple delta)
- [ ] Projected completion date: `(current_weight - target_weight) / rate_per_day`
- [ ] `data.json` includes: `start_weight_kg`, `current_trend_weight_kg`, `target_weight_kg`, `kg_lost`, `kg_remaining`, `projected_completion_date`, `rate_kg_per_week`
- [ ] Cut progress bar UI: start → current → target with labels
- [ ] "Projected completion: ~YYYY-MM-DD" with "(estimated)" label
- [ ] TDEE vs actual calories line chart (from MF Quick Export)
- [ ] Daily deficit bar: TDEE − calories (green if 0–500, yellow 500–800, red >800)
- [ ] 7-day avg deficit shown as summary stat
- [ ] Flag: days where deficit >800 kcal marked as ⚠ on chart and counted in `data.json`

**Technical Notes:**
- Rate of loss: use last 30 data points, simple (last - first) / 30 is fine
- TDEE from `mf_daily.tdee` field; if TDEE missing for a day, skip that day in deficit calc

**Dependencies:** STORY-203 (needs lean mass to compute target weight)

---

### STORY-205: Push / Pull / Upper / Lower Indexes + Balance Score

**Epic:** EPIC-003 — Training Volume Intelligence
**Priority:** Must Have
**Points:** 5

**User Story:**
As a coach,
I want to see weekly training volume broken down into Push/Pull/Upper/Lower indexes,
So that I can spot imbalances and over/under-training in seconds.

**Acceptance Criteria:**
- [ ] Parser aggregates MF Muscle Groups - Sets into weekly totals per muscle group
- [ ] Push = Chest + Front Delts + Side Delts + Triceps sets/week
- [ ] Pull = Lats + Upper Back + Rear Delts + Biceps sets/week
- [ ] Upper = Push + Pull + Upper Traps sets/week
- [ ] Lower = Quads + Hamstrings + Glutes + Calves sets/week
- [ ] Volume zones applied using config MEV/MRV: 🔵 below MEV / 🟢 MEV–MAV / 🟡 MAV–MRV / 🔴 above MRV (MAV = midpoint of MEV/MRV)
- [ ] Push/Pull balance ratio: `push_sets / pull_sets × 100` (target: 80–120%)
- [ ] `data.json` includes last 12 weeks of weekly index data
- [ ] Dashboard: 4 index cards with set count + zone colour + delta vs last week
- [ ] Push/Pull balance % with colour indicator (green 80–120%, yellow 70–80%/120–130%, red outside)
- [ ] 8-week history bar chart for all 4 indexes

**Technical Notes:**
- ISO week boundaries used for weekly aggregation
- MF muscle group column names: exact string match to MF export header names (e.g. "Chest", "Quads")
- Partial weeks (current week in progress) shown with dashed outline on chart

**Dependencies:** STORY-201

---

### STORY-206: 22-Muscle Volume Heatmap

**Epic:** EPIC-003 — Training Volume Intelligence
**Priority:** Should Have
**Points:** 3

**User Story:**
As an athlete,
I want to see a heatmap of all 22 muscle groups across the last 8 weeks,
So that I can spot chronic under- or over-training of specific muscles.

**Acceptance Criteria:**
- [ ] Grid: 22 muscle groups (rows, sorted by Push/Pull/Upper/Lower grouping) × 8 calendar weeks (columns)
- [ ] Cell colour = volume zone (same 4-level scale as STORY-205)
- [ ] Cell tooltip: exact set count + volume kg from MF Muscle Groups - Volume
- [ ] Muscle groups with zero data shown in grey (not absent — zero is data)
- [ ] Week labels as "Wk N" (ISO week number) on column headers
- [ ] Muscle group labels with their zone group (e.g. "Chest (Push)")

**Technical Notes:**
- Data already in `data.json` from STORY-205 weekly aggregation — no new parser work needed
- Heatmap built with CSS grid or HTML table; no extra chart library needed
- Volume tooltip: from `muscle_volume` weekly aggregate (kg/week per muscle)

**Dependencies:** STORY-205

---

### STORY-207: Per-Exercise Progressive Overload Tracker

**Epic:** EPIC-004 — Progressive Overload & Recovery
**Priority:** Must Have
**Points:** 5

**User Story:**
As an athlete,
I want to see weight and volume trends for each exercise,
So that I can confirm I'm making progress and catch stalls early.

**Acceptance Criteria:**
- [ ] Parser groups Workout Log by exercise name (after stripping superset suffixes)
- [ ] Per exercise per session: top set weight (kg), avg weight, total reps, total volume load (weight × reps), avg RIR
- [ ] PR detection: session where top set weight exceeds all prior sessions for that exercise
- [ ] Stall detection: last 3 consecutive sessions for same exercise have same or lower top set weight
- [ ] `data.json.exercises` array: `[{ name, sessions: [{date, top_weight, avg_weight, total_reps, volume_load, rir, is_pr, is_stall_session}], has_stall: bool, latest_weight, pr_weight }]`
- [ ] Active stalls list in `data.json.flags.stalled_exercises` (exercise name + sessions since last increase)
- [ ] Dashboard: searchable/filterable exercise dropdown
- [ ] Selected exercise shows: weight trend chart (line, accent colour for PRs), volume load trend chart, last 10 sets table
- [ ] Stall badge shown next to exercise name in dropdown when `has_stall: true`

**Technical Notes:**
- Top set = max weight in a session (ignore warm-up sets if Set Type = "Warm-up")
- Exercise name normalisation: lowercase + strip extra whitespace after suffix removal
- Chart uses Chart.js point styling to mark PR sessions with a star/diamond

**Dependencies:** STORY-201

---

### STORY-208: RIR Trends + Volume Spike Detector + Cardio Tracker

**Epic:** EPIC-004 — Progressive Overload & Recovery
**Priority:** Should Have
**Points:** 5

**User Story:**
As a coach,
I want to see training effort (RIR), volume spikes, and cardio sessions at a glance,
So that I can assess recovery risk and training consistency.

**Acceptance Criteria:**
- [ ] Parser computes per-workout average RIR (excluding warm-up sets)
- [ ] Failure sets (RIR = 0) counted per workout
- [ ] `data.json.workouts[*]` includes `avg_rir`, `failure_sets_count`
- [ ] Rolling 4-week average total weekly sets calculated
- [ ] Volume spike: week flagged if current week sets > 120% of rolling 4-week average
- [ ] `data.json.flags.volume_spike_this_week: bool` + `volume_spike_pct` (how far above average)
- [ ] Historical spike weeks in `data.json.volume_history[*].is_spike`
- [ ] Cardio from HC: VO2 sessions (count/week), padel sessions (count/week)
- [ ] Dashboard RIR chart: avg RIR per workout over time (lower = harder), failure sets marked red
- [ ] 4-week avg RIR stat card
- [ ] Cardio cards: VO2 count vs target (2/week) in green/red, padel count
- [ ] Volume trend chart with spike markers (triangles on weeks with spikes)

**Technical Notes:**
- RIR field in MF Workout Log may be empty string — treat as null, exclude from average
- Cardio pulled from `data["cardio"]` which HC parser populates (STORY-202)
- Volume spike uses total sets across ALL muscle groups (not per-group)

**Dependencies:** STORY-201, STORY-202

---

### STORY-209: Nutrition Adherence + Correlation Flags

**Epic:** EPIC-005 — Coach Interface & Nutrition
**Priority:** Must Have
**Points:** 5

**User Story:**
As a coach,
I want to see exact nutrition adherence against MF-set targets (not hardcoded),
So that I can identify patterns in under-eating relative to training.

**Acceptance Criteria:**
- [ ] Protein adherence per day: hit if `actual_protein >= target_protein` (both from MF Quick Export)
- [ ] Calorie adherence per day: hit if `abs(actual_calories - target_calories) <= 200`
- [ ] 7-day and 30-day adherence percentages computed by parser
- [ ] Correlation flag: day flagged if `actual_calories < (target_calories - 400)` AND `total_sets > 30d_avg_sets`
- [ ] `data.json.nutrition_adherence`: `{ protein_7d_pct, protein_30d_pct, calorie_7d_pct, calorie_30d_pct, correlation_flags: [{date, deficit_kcal, sets_that_day}] }`
- [ ] Dashboard nutrition tab: macro bars (today's actual vs targets)
- [ ] Protein adherence calendar heatmap (last 30 days): green = hit, red = miss, grey = no data
- [ ] 7d/30d adherence score cards
- [ ] Correlation flags shown as ⚠ markers on nutrition chart
- [ ] Count of correlation flags in last 7 days on Coach Brief data

**Technical Notes:**
- MF Quick Export columns for targets: "Target Calories", "Target Protein" — confirm exact column names from file
- Calendar heatmap: CSS grid 7×5 (days of week × weeks), no extra lib

**Dependencies:** STORY-201

---

### STORY-210: Coach Brief Card + Coach / Athlete View Toggle

**Epic:** EPIC-005 — Coach Interface & Nutrition
**Priority:** Must Have
**Points:** 5

**User Story:**
As a coach,
I want to open the URL and see everything relevant in under 10 seconds on my phone,
So that I can assess Benjamin's training status before a session without scrolling.

**Acceptance Criteria:**
- [ ] Coach Brief card at top of page (always visible in both views)
- [ ] Brief contents (all from `data.json`, no hardcoded values):
  - MF trend weight + 7-day delta (↑/↓ kg)
  - Estimated lean mass (kg) + FFMI
  - BF% estimate (YMCA/Deurenberg average)
  - Training streak (consecutive days with workout log entries)
  - This week: Push / Pull / Upper / Lower sets with zone colour pill
  - Push/Pull balance %
  - 7-day protein adherence % vs MF target
  - 7-day avg calories vs target + avg deficit (kcal)
  - Active flags: volume spike / stall count / imbalance / high deficit days
- [ ] All flags as colour-coded pills: 🟢 ok / 🟡 monitor / 🔴 alert
- [ ] Coach/Athlete toggle button at top of page
- [ ] Coach View: Brief card + cut progress + Push/Pull/Upper/Lower weekly summary + active flags
- [ ] Athlete View: Full dashboard (all charts, heatmap, exercise tracker, nutrition detail, cardio)
- [ ] Default view: Coach View
- [ ] Toggle state persisted in `localStorage`
- [ ] Coach View fits on mobile screen (390px width) without scrolling
- [ ] Brief card renders in <1s

**Technical Notes:**
- `data.json.summary` object pre-computed by parser with all Coach Brief values
- Training streak: consecutive days where `workouts` array has an entry
- Active stalls count from `data.json.flags.stalled_exercises.length`
- Imbalance flag: push/pull balance outside 80–120%

**Dependencies:** STORY-203, STORY-204, STORY-205, STORY-207, STORY-208, STORY-209 (all data sources must be in data.json)

---

## Sprint Allocation

---

### Sprint 1 (Week 1) — 11 / 15 points

**Goal:** Complete data pipeline v2 — parser reads all MacroFactor exports, merges with Health Connect, and produces enriched data.json

**Stories:**
| Story | Title | Points | Priority |
|-------|-------|--------|----------|
| STORY-201 | MacroFactor XLSX Reader + Athlete Config | 8 | Must Have |
| STORY-202 | Health Connect Integration + update.sh v2 | 3 | Must Have |

**Total:** 11 / 15 points (73%)

**Sprint Goal Achieved When:** `uv run python parse.py` runs cleanly, produces `data.json` with MF + HC data, `update.sh` works end-to-end.

**Risks:**
- MF XLSX column names may vary between monthly exports — validate headers defensively
- Superset suffix format (∈ SS1) — confirm exact encoding from live file

**Dependencies:** `drive_export/workout/` XLSX files accessible locally

---

### Sprint 2 (Week 2) — 10 / 15 points

**Goal:** Body composition intelligence — reliable BF% estimates, lean mass tracking, cut progress, and TDEE analysis live in the dashboard

**Stories:**
| Story | Title | Points | Priority |
|-------|-------|--------|----------|
| STORY-203 | BF% Estimation + Lean Mass + FFMI Dashboard | 5 | Must Have |
| STORY-204 | Cut Progress Tracker + TDEE Energy Balance | 5 | Must Have |

**Total:** 10 / 15 points (67%)

**Sprint Goal Achieved When:** Dashboard shows body comp section with lean mass line, FFMI chart, cut progress bar, and TDEE vs calories deficit chart.

**Risks:**
- BF% formula accuracy check — spot-test against known values
- Projected completion date logic needs sensible handling for slow/no loss periods

**Dependencies:** STORY-201 complete

---

### Sprint 3 (Week 3) — 13 / 15 points

**Goal:** Training volume intelligence — Push/Pull/Upper/Lower indexes, balance score, heatmap, RIR, volume spikes, and cardio all visible

**Stories:**
| Story | Title | Points | Priority |
|-------|-------|--------|----------|
| STORY-205 | Push/Pull/Upper/Lower Indexes + Balance Score | 5 | Must Have |
| STORY-206 | 22-Muscle Volume Heatmap | 3 | Should Have |
| STORY-208 | RIR Trends + Volume Spike + Cardio | 5 | Should Have |

**Total:** 13 / 15 points (87%)

**Sprint Goal Achieved When:** Volume tab shows all 4 index cards, balance score, heatmap, RIR chart, spike flags, and cardio counts.

**Risks:**
- Muscle group column names must match MF export exactly — validate against real file headers
- Current partial week displayed correctly (dashed outline, not counted in zone alerts)

**Dependencies:** STORY-201, STORY-202

---

### Sprint 4 (Week 4) — 15 / 15 points

**Goal:** Progressive overload tracking, nutrition adherence, and the Coach Brief card — complete the coaching intelligence platform

**Stories:**
| Story | Title | Points | Priority |
|-------|-------|--------|----------|
| STORY-207 | Per-Exercise Progressive Overload Tracker | 5 | Must Have |
| STORY-209 | Nutrition Adherence + Correlation Flags | 5 | Must Have |
| STORY-210 | Coach Brief Card + Coach/Athlete Toggle | 5 | Must Have |

**Total:** 15 / 15 points (100%)

**Sprint Goal Achieved When:** Coach can open URL, see full brief, toggle to athlete view, drill into any exercise's weight trend, see protein adherence calendar.

**Risks:**
- STORY-210 depends on all prior stories' data.json structure — do it last in the sprint
- MF target columns may have different names in different export versions

**Dependencies:** All prior sprints complete

---

## Epic Traceability

| Epic ID | Epic Name | Stories | Total Points | Sprint |
|---------|-----------|---------|--------------|--------|
| EPIC-001 | Data Pipeline v2 | STORY-201, STORY-202 | 11 | 1 |
| EPIC-002 | Body Composition | STORY-203, STORY-204 | 10 | 2 |
| EPIC-003 | Volume Intelligence | STORY-205, STORY-206 | 8 | 3 |
| EPIC-004 | Progressive Overload & Recovery | STORY-207, STORY-208 | 10 | 3–4 |
| EPIC-005 | Coach Interface & Nutrition | STORY-209, STORY-210 | 10 | 4 |

---

## Requirements Coverage

| FR ID | FR Name | Story | Sprint |
|-------|---------|-------|--------|
| FR-001 | MacroFactor XLSX Parser | STORY-201 | 1 |
| FR-002 | BF% Estimation Engine | STORY-203 | 2 |
| FR-003 | Lean Mass & FFMI Tracking | STORY-203 | 2 |
| FR-004 | Cut Progress Tracker | STORY-204 | 2 |
| FR-005 | TDEE & Energy Balance | STORY-204 | 2 |
| FR-006 | Push/Pull/Upper/Lower Indexes | STORY-205 | 3 |
| FR-007 | 22-Muscle Volume Heatmap | STORY-206 | 3 |
| FR-008 | Push/Pull Balance Score | STORY-205 | 3 |
| FR-009 | Per-Exercise Progressive Overload | STORY-207 | 4 |
| FR-010 | RIR Trend Tracking | STORY-208 | 3 |
| FR-011 | Volume Spike Detector | STORY-208 | 3 |
| FR-012 | Cardio & Sport Tracker | STORY-208 | 3 |
| FR-013 | Nutrition Adherence | STORY-209 | 4 |
| FR-014 | Nutrition × Training Correlation Flag | STORY-209 | 4 |
| FR-015 | Coach Brief Card | STORY-210 | 4 |
| FR-016 | Coach / Athlete View Toggle | STORY-210 | 4 |
| FR-017 | Update Pipeline v2 | STORY-202 | 1 |

**Coverage:** 17 / 17 FRs covered ✓

---

## Risks and Mitigation

**High:**
- MF XLSX column header names vary between exports (Jan vs Feb file may differ) → **Mitigation:** Log all headers at parse time; validate against expected list; skip unknown columns gracefully
- Superset suffix encoding (`∈` is Unicode U+2208) → **Mitigation:** Strip any text after `∈` or `(SS` using regex in exercise name normalisation

**Medium:**
- BF% estimate accuracy — scale bias may be large → **Mitigation:** Show both YMCA and Deurenberg values and their average; label as "estimated"
- Chart.js heatmap not native (STORY-206) → **Mitigation:** Build with CSS grid, no extra lib needed

**Low:**
- data.json size exceeds 500 KB → **Mitigation:** Parser aggregates exercise history (don't dump all raw rows; keep last 20 sessions per exercise)
- Projected cut completion date edge cases (weight plateau) → **Mitigation:** Show "rate too slow to estimate" if weekly loss < 0.05 kg/week

---

## Dependencies

| Dependency | Type | Notes |
|-----------|------|-------|
| `drive_export/workout/MacroFactor-*.xlsx` | Data (local) | Must exist before Sprint 1; gitignored |
| `health_connect_export.db` | Data (local) | Optional; fallback if missing |
| `workout-config.json` | Config | Created in STORY-201 |
| openpyxl (uv managed) | Python lib | Auto-installed by `uv run` |
| Chart.js CDN | Frontend | No change from v1 |

---

## Definition of Done

For a story to be considered complete:
- [ ] Parser changes run clean with `uv run python parse.py`
- [ ] `data.json` updated with new fields
- [ ] Dashboard renders new section correctly with real data
- [ ] No JS console errors
- [ ] Mobile layout works at 390px (Coach Brief specifically)
- [ ] Acceptance criteria all checked
- [ ] Committed and pushed to main (Vercel auto-deploys)

---

## Next Steps

**Immediate:** Begin Sprint 1 — STORY-201

Run `/dev-story STORY-201` to implement the MacroFactor XLSX reader.

**Sprint cadence:**
- Sprint length: 1 week
- All 4 sprints in sequence
- Each sprint ends with `git push` → Vercel deploys → verify live site

---

**This plan was created using BMAD Method v6 - Phase 4 (Implementation Planning)**
