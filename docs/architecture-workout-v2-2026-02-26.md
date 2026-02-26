# System Architecture: workout v2

**Date:** 2026-02-26
**Architect:** trom
**Version:** 1.0
**Project Type:** web-app
**Project Level:** 2
**Status:** Draft

---

## Document Overview

Technical blueprint for the workout dashboard v2. This is a **static data pipeline + static site** — no backend server, no database, no API. All computation happens in the Python parser at update time. The browser only renders pre-computed JSON.

**Related Documents:**
- PRD: `docs/prd-workout-v2-2026-02-26.md`
- Product Brief: `docs/product-brief-workout-v2-2026-02-26.md`

---

## Executive Summary

The system has two distinct parts:

1. **Parser** (`parse.py`) — Python script run locally by the athlete. Reads MacroFactor XLSX exports + Health Connect SQLite DB, computes all analytics (volume indexes, BF% estimates, progressive overload, flags), and writes a single `public/data.json` file.

2. **Dashboard** (`public/`) — Vanilla HTML/JS/CSS static site. Fetches `data.json` at load time and renders all charts and views. Deployed to Vercel, auto-deploys on `git push`.

There is no server, no API, no database, no build step, and no runtime computation beyond rendering. Everything the dashboard shows is pre-computed by the parser.

---

## Architectural Drivers

| Driver | Source | Impact |
|--------|--------|--------|
| Zero infrastructure (free, simple) | NFR-003/005 | Static site only, no backend |
| No external runtime deps in parser | NFR-004 | uv manages Python deps; only stdlib + openpyxl |
| `data.json` < 500 KB | NFR-001 | Parser must aggregate, not dump raw data |
| Mobile-first coach view | NFR-002 | All charts must render cleanly at 390px |
| Graceful degradation | NFR-005 | Missing data sources must not crash parser or UI |

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  LOCAL MACHINE (athlete's Mac)                              │
│                                                             │
│  drive_export/workout/                                      │
│    MacroFactor-january.xlsx  ──┐                           │
│    MacroFactor-february.xlsx ──┤                           │
│    MacroFactor-march.xlsx ... ─┤──→  parse.py  ──→  public/data.json  │
│                                │         ↑                  │
│  health_connect_export.db ─────┘    workout-config.json    │
│                                                             │
└────────────────────────────┬────────────────────────────────┘
                             │  git push
                             ▼
                    GitHub (limiteinductive/workout)
                             │  webhook
                             ▼
                    Vercel (static hosting)
                             │
                             ▼
                    https://workout-hgi.vercel.app
                             │
                    ┌────────┴────────┐
                    ▼                 ▼
             Coach (mobile)    Athlete (any device)
```

### Architectural Pattern

**Pattern:** Offline-first data pipeline + static site (JAMstack-style)

**Rationale:** This project has no concurrent users, no auth, no write operations from the browser, and no real-time requirements. All data originates from local exports. The correct architecture is: transform data locally → serve statically. Anything more complex would be over-engineering.

---

## Technology Stack

### Frontend

**Choice:** Vanilla HTML5 + CSS + JavaScript (ES6) + Chart.js CDN

**Rationale:** No framework needed. The dashboard is a read-only data visualisation. No state management, no routing, no component lifecycle. Adding React/Vue would add complexity with zero benefit. Chart.js from CDN avoids any build step.

**Trade-offs:** ✓ Zero build complexity, works without Node.js ✗ No component reuse patterns (acceptable at this scale)

### Backend / Parser

**Choice:** Python 3.11+ managed via `uv`

**Rationale:** Python has excellent Excel/SQLite libraries. `uv` eliminates `pip install` friction. Parser runs on-demand (not a server), so startup time is irrelevant. stdlib `sqlite3` + `openpyxl` cover everything needed.

**Dependencies:**
```toml
[project]
dependencies = ["openpyxl>=3.1"]
```

### Data Store

**Choice:** `public/data.json` (flat file)

**Rationale:** Single consumer (the browser), single writer (the parser), read-only at runtime. A database would add zero value. JSON over CDN is faster than any API response.

### Infrastructure

**Choice:** Vercel free tier (static hosting) + GitHub

**Rationale:** Already configured in v1. Zero cost, auto-deploys on push, global CDN, custom domain support if needed later.

### Development & Deployment

| Tool | Purpose |
|------|---------|
| `uv` | Python dependency + environment management |
| `git` | Version control |
| `update.sh` | One-command local update pipeline |
| Vercel GitHub integration | Auto-deploy on push to `main` |

---

## System Components

### Component 1: MacroFactor XLSX Reader (`parse_mf.py` or module in `parse.py`)

**Purpose:** Read and merge all MacroFactor monthly XLSX exports into normalised Python dicts.

**Responsibilities:**
- Discover all `MacroFactor-*.xlsx` files in `drive_export/workout/`
- Parse 4 sheets per file: Quick Export, Workout Log, Muscle Groups - Sets, Muscle Groups - Volume
- Normalise date formats, handle None values
- Merge across files, deduplicate by date (latest file wins)
- Return typed data structures

**Output structures:**
```python
daily_nutrition: list[dict]  # date, kcal, protein, fat, carbs, target_*, tdee, trend_weight_kg
workout_log: list[dict]      # date, workout_name, exercise, weight_kg, reps, rir, set_type
muscle_sets: list[dict]      # date, chest, quads, lats, ... (22 muscle groups)
muscle_volume: list[dict]    # date, chest, quads, lats, ... (kg)
```

**FRs addressed:** FR-001, FR-005, FR-006, FR-007, FR-009, FR-010, FR-013

---

### Component 2: Health Connect Reader (existing `parse.py` refactored)

**Purpose:** Read Health Connect SQLite DB for data not available in MacroFactor.

**Responsibilities:**
- Weight readings (raw scale, used as fallback + HC-only metrics)
- Body fat % from scale (used for comparison overlay only)
- Cardio/VO2 sessions and padel sessions (exercise_session_record_table)

**Note:** Nutrition data from HC is deprecated — MF Quick Export is the authoritative source.

**FRs addressed:** FR-002 (weight input), FR-012

---

### Component 3: Analytics Engine (functions in `parse.py`)

**Purpose:** Compute all derived metrics. This is where the intelligence lives.

**Responsibilities:**

*Body composition:*
- YMCA BF% estimate: `(-98.42 + 4.15 × waist_in - 0.082 × weight_lb) / weight_lb × 100`
- Deurenberg BF% estimate: `1.20 × bmi + 0.23 × age - 10.8 - 5.4`
- Lean mass: `weight_kg × (1 - bf_pct/100)`
- FFMI: `lean_kg / height_m²`
- Cut progress: rate of loss, projected target date

*Volume indexes (weekly aggregation):*
- Push = Chest + Front Delts + Side Delts + Triceps sets/week
- Pull = Lats + Upper Back + Rear Delts + Biceps sets/week
- Upper = Push + Pull + Upper Traps
- Lower = Quads + Hamstrings + Glutes + Calves
- Volume zones per muscle group vs MEV/MRV from config
- Push/Pull balance score = (push/pull) × 100

*Progressive overload:*
- Per-exercise: sort sessions chronologically, compute weight trend
- Flag stalls: weight not increased for 3+ consecutive sessions of same exercise
- PR detection: highest weight ever for each exercise

*Flags:*
- Volume spike: current week > 120% of 4-week rolling average
- Push/Pull imbalance: balance score outside 80–120%
- Recovery risk days: calories < (target − 400) AND sets > 30d avg
- Stalling exercises: list of exercise names with stall flag

**FRs addressed:** FR-002, FR-003, FR-004, FR-005, FR-006, FR-008, FR-009, FR-010, FR-011, FR-014

---

### Component 4: Config (`workout-config.json`)

**Purpose:** User-editable configuration for athlete profile and MEV/MRV landmarks.

**Responsibilities:**
- Athlete profile (age, height, waist, sex, cut start weight, target BF%)
- MEV/MRV/MAV per muscle group
- Caloric thresholds for flag detection
- VO2/padel session classification keywords

**Schema:**
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
  "targets": {
    "protein_floor_g": 200,
    "calories_target_kcal": 2300,
    "vo2_sessions_per_week": 2,
    "recovery_risk_calorie_deficit_from_target": 400
  },
  "landmarks": {
    "chest":       { "mev": 8,  "mav": 14, "mrv": 20 },
    "lats":        { "mev": 10, "mav": 16, "mrv": 22 },
    "upper_back":  { "mev": 10, "mav": 16, "mrv": 22 },
    "rear_delts":  { "mev": 6,  "mav": 12, "mrv": 18 },
    "biceps":      { "mev": 6,  "mav": 10, "mrv": 16 },
    "triceps":     { "mev": 6,  "mav": 10, "mrv": 16 },
    "front_delts": { "mev": 4,  "mav": 8,  "mrv": 14 },
    "side_delts":  { "mev": 8,  "mav": 14, "mrv": 20 },
    "upper_traps": { "mev": 4,  "mav": 8,  "mrv": 14 },
    "quads":       { "mev": 8,  "mav": 14, "mrv": 20 },
    "hamstrings":  { "mev": 6,  "mav": 10, "mrv": 16 },
    "glutes":      { "mev": 6,  "mav": 10, "mrv": 16 },
    "calves":      { "mev": 8,  "mav": 12, "mrv": 16 },
    "abs":         { "mev": 6,  "mav": 10, "mrv": 16 }
  },
  "cardio_keywords": {
    "vo2": ["bike", "cycling", "vélo"],
    "padel": ["padel"]
  }
}
```

**FRs addressed:** FR-002, FR-006, FR-013, FR-014

---

### Component 5: `public/data.json` (the "API")

**Purpose:** Pre-computed, serialised analytics ready for the browser to render. The contract between parser and dashboard.

**Full schema:**
```json
{
  "generated_at": "2026-02-26T12:00:00Z",
  "athlete": { "name": "...", "age": 31, "height_cm": 181, "target_bf_pct": 15, "cut_start_kg": 120 },

  "weight": [
    {
      "date": "2026-02-26",
      "kg": 107.1,
      "trend_kg": 107.0,
      "bf_ymca": 20.1,
      "bf_deurenberg": 30.2,
      "bf_scale": 25.2,
      "lean_kg": 85.7,
      "ffmi": 26.1
    }
  ],

  "nutrition": [
    {
      "date": "2026-02-26",
      "kcal": 2280,
      "protein_g": 228,
      "fat_g": 72,
      "carbs_g": 175,
      "target_kcal": 2319,
      "target_protein_g": 225,
      "tdee": 2870,
      "deficit": 590,
      "hit_protein": true,
      "hit_calories": true,
      "recovery_risk": false
    }
  ],

  "muscle_sets": [
    { "date": "2026-02-26", "chest": 10, "lats": 10, "biceps": 7.5, "triceps": 5, ... }
  ],

  "muscle_volume_kg": [
    { "date": "2026-02-26", "chest": 6263, "lats": 8461, ... }
  ],

  "weekly_indexes": [
    {
      "week": "2026-W08",
      "push": 45, "pull": 42, "upper": 112, "lower": 38,
      "push_zone": "green", "pull_zone": "green",
      "upper_zone": "green", "lower_zone": "yellow",
      "balance_score": 107,
      "total_sets": 205,
      "rolling_avg_sets": 188,
      "is_spike": false,
      "muscle_sets": { "chest": 42, "lats": 38, ... }
    }
  ],

  "workouts": [
    {
      "date": "2026-02-26",
      "name": "Workout A",
      "duration_s": 8877,
      "total_sets": 22,
      "total_reps": 192,
      "avg_rir": 1.4,
      "failure_sets": 2,
      "exercises": [
        {
          "name": "Seated Overhand Grip Pin-Loaded Machine Chest Press",
          "sets": [
            { "weight_kg": 80, "reps": 11, "rir": 1, "type": "Failure Set" }
          ]
        }
      ]
    }
  ],

  "exercise_history": {
    "Seated Overhand Grip Pin-Loaded Machine Chest Press": {
      "sessions": [
        { "date": "2026-02-26", "best_weight_kg": 80, "total_reps": 38, "avg_rir": 1.2 }
      ],
      "is_pr_today": false,
      "is_stalling": false,
      "all_time_best_kg": 82.5
    }
  },

  "cardio": [
    { "date": "2026-02-25", "type": "vo2", "duration_min": 32 }
  ],

  "flags": {
    "volume_spike_this_week": false,
    "push_pull_imbalance": false,
    "balance_score": 107,
    "stalling_exercises": [],
    "recovery_risk_days_last_7": 0,
    "consecutive_training_days": 7
  },

  "cut_progress": {
    "start_kg": 120,
    "current_kg": 107.1,
    "current_lean_kg": 85.7,
    "target_weight_kg": 100.8,
    "kg_lost": 12.9,
    "kg_remaining": 6.3,
    "rate_kg_per_week": -0.42,
    "projected_weeks": 15,
    "projected_date": "2026-06-10"
  }
}
```

**Size estimate:** ~200–350 KB for 3 months of data. Well under 500 KB limit.

---

### Component 6: Dashboard (`public/`)

**Purpose:** Static web app that renders `data.json`. Pure presentation layer.

**Files:**
```
public/
  index.html     — structure, tabs, chart canvases
  style.css      — dark theme, responsive layout
  app.js         — data loading, chart rendering, Coach/Athlete views
  data.json      — generated by parser (gitignored if desired, or committed)
```

**Modules in `app.js` (logical sections, not separate files):**
- `loadData()` — fetch + parse data.json
- `renderCoachBrief()` — Coach Brief card
- `renderBodyComposition()` — weight, lean mass, FFMI, cut progress
- `renderVolumeIndexes()` — Push/Pull/Upper/Lower cards + charts
- `renderVolumeHeatmap()` — 22-muscle CSS grid
- `renderProgressiveOverload()` — exercise list + per-exercise charts
- `renderNutrition()` — adherence, TDEE, macros
- `renderCardio()` — VO2/padel counts
- `tabManager()` — Coach/Athlete view toggle

**FRs addressed:** FR-003, FR-004, FR-006, FR-007, FR-008, FR-009, FR-010, FR-013, FR-015, FR-016

---

## Data Flow

### Update Flow (athlete's machine)

```
1. Athlete drops new MacroFactor-march.xlsx into drive_export/workout/
2. ./update.sh
   a. uv run python parse.py
      - Reads all MacroFactor-*.xlsx → merges → normalises
      - Reads health_connect_export.db → weight, BF%, cardio
      - Reads workout-config.json → athlete profile + landmarks
      - Computes all analytics (BF estimation, volume indexes, overload, flags)
      - Writes public/data.json
   b. git add public/data.json
   c. git commit -m "data: 2026-03-01"
   d. git push
3. Vercel detects push → deploys in ~15 seconds
4. Coach opens URL → sees updated data
```

### Read Flow (browser)

```
Browser opens https://workout-hgi.vercel.app
  → Vercel serves index.html (CDN edge)
  → Browser fetches data.json (~300 KB, CDN-cached)
  → app.js parses JSON → renders all views
  → User toggles Coach/Athlete view (localStorage)
  → Charts rendered client-side by Chart.js
```

---

## Non-Functional Requirements Coverage

### NFR-001: Performance

**Requirement:** `data.json` < 500 KB; page renders < 3s on 4G

**Solution:**
- Parser aggregates daily muscle group data (not raw set-level) for volume heatmap — keeps size down
- `exercise_history` stores only session-level summaries (best weight, total reps), not every individual set
- Individual set details only stored inside `workouts` array (last 90 sessions)
- Vercel CDN serves from edge — typical latency < 50ms for static assets
- Chart.js renders incrementally; Coach Brief card loads first

**Validation:** `ls -lh public/data.json` after parse; Lighthouse mobile score

---

### NFR-002: Mobile Usability

**Requirement:** Coach Brief readable at 390px, no horizontal scroll

**Solution:**
- CSS Grid with `grid-template-columns: 1fr 1fr` on cards (already in v1)
- Volume heatmap uses horizontal scroll only within its container (not full page)
- Chart.js `maintainAspectRatio: false` with fixed max-height containers
- Coach Brief uses large font sizes for key numbers, muted text for labels

---

### NFR-003: Zero Auth

**Requirement:** Production URL always public

**Solution:** Vercel SSO protection set to `"preview"` only via API (already done in v1). Production alias `workout-hgi.vercel.app` returns 200 without auth.

---

### NFR-004: Dependency Management via uv

**Requirement:** `uv run python parse.py` works anywhere

**Solution:**
- `pyproject.toml` declares `openpyxl>=3.1` as only external dep
- `uv.lock` pins exact versions
- `uv run` auto-creates venv and installs on first run
- No global pip installs required

---

### NFR-005: Graceful Degradation

**Requirement:** Missing data sources must not crash

**Solution (parser):**
- If no HC DB found: log warning, skip weight/BF%/cardio sections
- If no MF XLSX found: log error, exit with clear message
- If `workout-config.json` missing: use hardcoded defaults, log warning
- Each parser section wrapped in try/except with per-section error logging

**Solution (browser):**
- `app.js` checks for null/empty arrays before rendering each section
- Missing sections show a placeholder: "No data available for this section"
- No uncaught exceptions — all chart renders guarded

---

## Security Architecture

### Authentication
None — fully public by design. No user accounts, no sessions, no tokens.

### Data Sensitivity
- `health_connect_export.db` — raw health data, **never committed to git** (`.gitignore`)
- `drive_export/` — raw MF exports, **never committed to git** (`.gitignore`)
- `public/data.json` — aggregated/derived data, committed and public. Contains weight, nutrition, workout data. Acceptable given explicit user consent (public fitness tracking for coaching).

### Security Practices
- No user input in the browser (read-only dashboard) → no XSS, no injection vectors
- No server-side code → no server vulnerabilities
- `Content-Security-Policy` header via `vercel.json` to restrict script sources to self + jsdelivr CDN

---

## Code Organisation

```
workout/
├── parse.py               # Main parser entry point
├── workout-config.json    # Athlete config + MEV/MRV landmarks
├── update.sh              # One-command update pipeline
├── pyproject.toml         # uv/Python deps (openpyxl)
├── uv.lock                # Pinned dependency versions
├── CLAUDE.md              # Agent instructions
├── .gitignore             # Excludes .db, drive_export/, .vercel/
├── vercel.json            # Vercel config (outputDirectory: public)
│
├── public/                # Static site (deployed to Vercel)
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   └── data.json          # Generated by parser
│
├── drive_export/          # GITIGNORED — raw exports
│   └── workout/
│       ├── MacroFactor-january.xlsx
│       ├── MacroFactor-february.xlsx
│       └── ...
│
├── docs/                  # BMAD planning docs
│   ├── product-brief-*.md
│   ├── prd-*.md
│   ├── architecture-*.md
│   └── sprint-plan-*.md
│
└── health_connect_export.db  # GITIGNORED — raw health data
```

### Parser Structure (`parse.py`)

```python
# Logical sections (single file, ~400 lines):
# 1. Config loading (workout-config.json)
# 2. MF XLSX reader (openpyxl)
#    - read_quick_export()
#    - read_workout_log()
#    - read_muscle_sets()
#    - read_muscle_volume()
# 3. HC SQLite reader
#    - read_weight()
#    - read_body_fat()
#    - read_cardio_sessions()
# 4. Analytics engine
#    - estimate_bf()
#    - compute_lean_mass_ffmi()
#    - aggregate_weekly_indexes()
#    - compute_exercise_history()
#    - detect_flags()
#    - compute_cut_progress()
# 5. JSON serialiser + writer
```

---

## Requirements Traceability

### Functional Requirements

| FR | Name | Component(s) |
|----|------|-------------|
| FR-001 | MF XLSX Parser | MF Reader, `parse.py` |
| FR-002 | BF% Estimation | Analytics Engine, Config |
| FR-003 | Lean Mass & FFMI | Analytics Engine, Dashboard |
| FR-004 | Cut Progress | Analytics Engine, Dashboard |
| FR-005 | TDEE Tracking | MF Reader, Dashboard |
| FR-006 | Push/Pull/Upper/Lower Indexes | Analytics Engine, Dashboard |
| FR-007 | 22-Muscle Heatmap | Analytics Engine, Dashboard |
| FR-008 | Push/Pull Balance Score | Analytics Engine, Dashboard, Coach Brief |
| FR-009 | Per-Exercise Overload Tracker | MF Reader, Analytics Engine, Dashboard |
| FR-010 | RIR Trend | MF Reader, Analytics Engine, Dashboard |
| FR-011 | Volume Spike Detector | Analytics Engine, Flags, Coach Brief |
| FR-012 | Cardio Tracker | HC Reader, Dashboard, Coach Brief |
| FR-013 | Nutrition Adherence | MF Reader, Analytics Engine, Dashboard |
| FR-014 | Nutrition × Training Flag | Analytics Engine, Flags, Coach Brief |
| FR-015 | Coach Brief Card | Dashboard (renderCoachBrief) |
| FR-016 | Coach/Athlete View Toggle | Dashboard (tabManager) |
| FR-017 | Update Pipeline v2 | `update.sh`, `parse.py` |

### Non-Functional Requirements

| NFR | Name | Solution |
|-----|------|---------|
| NFR-001 | Performance | Data aggregation in parser, CDN delivery |
| NFR-002 | Mobile | CSS responsive grid, Chart.js config |
| NFR-003 | Zero Auth | Vercel SSO = preview only |
| NFR-004 | uv dependency mgmt | pyproject.toml + uv.lock |
| NFR-005 | Graceful degradation | Per-section try/except, JS null guards |

---

## Trade-offs & Decision Log

**Decision: Single `parse.py` file vs. modules**
- ✓ Single file: simpler to run, no import path issues, easier to read in one go
- ✗ Loses: code organisation at >600 lines
- **Decision:** Single file for now. Refactor to modules if it grows past ~500 lines.

**Decision: Commit `data.json` to git vs. regenerate on Vercel**
- ✓ Commit: simple, no build step on Vercel, works with current setup
- ✗ Commit: health-adjacent data in git history; large diffs on every update
- **Decision:** Commit for simplicity. Data is already public (intentionally). Can move to Vercel build step later.

**Decision: Pre-compute all analytics in parser vs. compute in browser**
- ✓ Parser: browser has nothing to compute, works on slow devices, testable in Python
- ✗ Parser: changing a chart requires a re-parse (not a big deal given daily cadence)
- **Decision:** Parser computes everything. Browser is pure rendering.

**Decision: MacroFactor as primary source for nutrition (vs. Health Connect)**
- ✓ MF: accurate kcal, has targets per day, has TDEE, has trend weight
- ✗ MF: requires monthly manual export
- **Decision:** MF is authoritative for nutrition and workouts. HC is authoritative for cardio sessions and scale readings.

---

## Open Issues & Risks

1. **MF export cadence**: Monthly export means data can be up to 31 days stale if user forgets. Consider adding a "last MF export date" warning in Coach Brief if > 7 days old.

2. **data.json size growth**: At ~300 KB for 2 months, full-year history would hit ~1.8 MB. Mitigation: parser caps `workouts` array at last 90 sessions; `exercise_history` stores only session summaries, not every set.

3. **Exercise name normalisation**: MF exercise names include suffixes like `∈ SS1` (superset markers). Parser must strip these for exercise history grouping.

4. **Waist measurement as single value**: Currently a single value in config. If waist changes significantly during cut, BF% estimates will drift. Future: allow waist history array.

---

## Future Considerations

- **Vercel build step**: Run `uv run python parse.py` as Vercel build command → removes need to commit data.json
- **Google Drive Watch**: Auto-pull new MF exports from Drive folder when they appear
- **Historical backfill**: If Benjamin exports earlier MF data (pre-January), parser handles it automatically
- **Strength Level integration**: Add manual 1RM entries to config → compare against standardised benchmarks
- **Neck measurement**: Enables US Navy BF% formula (more accurate than YMCA)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-26 | trom | Initial architecture for v2 |

---

## Next Steps

Run `/sprint-planning` to break the 5 epics into ~15 stories and plan implementation.

**Implementation order (recommended):**
1. EPIC-001 (Parser v2) — foundation, everything depends on this
2. EPIC-002 (Body Composition) — quick wins, parser already has weight data
3. EPIC-003 (Volume Intelligence) — MF muscle group data is pre-calculated
4. EPIC-004 (Progressive Overload) — requires exercise history from parser
5. EPIC-005 (Coach Interface) — final layer, depends on all data being available

---

**This document was created using BMAD Method v6 - Phase 3 (Solutioning)**

*To continue: Run `/sprint-planning`.*

---

## Appendix A: Technology Evaluation

| Category | Chosen | Considered | Why Not |
|----------|--------|------------|---------|
| Frontend | Vanilla JS | React, Vue | No state mgmt needed; zero build step |
| Charts | Chart.js | D3.js, Recharts | CDN-friendly, good docs, sufficient for our charts |
| Parser lang | Python | Node.js, Ruby | Best Excel + SQLite libraries; uv = zero friction |
| Hosting | Vercel | GH Pages, Netlify | Already configured; fastest CDN |
| Data format | JSON | CSV, Parquet | Browser-native; no parsing library needed |

## Appendix B: Capacity Planning

| Metric | Current | 1 Year |
|--------|---------|--------|
| Weight entries | 83 | ~450 |
| Nutrition days | 119 | ~650 |
| Workout sessions | ~180 (MF) | ~520 |
| Exercise history entries | ~50 exercises | ~50 exercises |
| `data.json` size | ~300 KB est. | ~900 KB est. |

At 1 year, data.json will approach the 500 KB target. Mitigation is already designed: cap workout sessions at 90, store exercise summaries not raw sets.

## Appendix C: Cost

| Service | Cost |
|---------|------|
| Vercel (static) | Free |
| GitHub | Free |
| Hosting | $0 |
| Total | **$0/month** |
