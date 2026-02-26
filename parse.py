#!/usr/bin/env python3
"""
Workout Dashboard v2 Parser
Reads MacroFactor XLSX exports + Health Connect SQLite DB
Outputs public/data.json

Usage: uv run python parse.py
       HC_DB_PATH=./path/to.db uv run python parse.py
"""

import json
import os
import re
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

import openpyxl

MF_DIR = Path("drive_export/workout")
HC_DB_PATH = Path(os.environ.get("HC_DB_PATH", "health_connect_export.db"))
OUT_PATH = Path("public/data.json")
CONFIG_PATH = Path("workout-config.json")

# 22 muscle groups in display order (matches MF column names without unit suffix)
MUSCLE_GROUPS = [
    "Chest", "Quads", "Upper Back", "Glutes", "Lats", "Hamstrings",
    "Biceps", "Triceps", "Front Delts", "Side Delts", "Lower Back",
    "Abs", "Calves", "Upper Traps", "Rear Delts", "Forearms",
    "Obliques", "Abductors", "Adductors", "Neck", "Tibialis", "Serratus",
]

# Superset suffix pattern: " ∈ SS1", " ∈ C2", etc. — strip " ∈ " + anything after
SS_PATTERN = re.compile(r"\s*∈.*$")

DEFAULT_CONFIG = {
    "athlete": {
        "age": 31,
        "height_cm": 181,
        "waist_cm": 101,
        "start_weight_kg": 120,
        "target_bf_pct": 15,
    },
    "volume_landmarks": {
        "Push":  {"mev": 16, "mrv": 24},
        "Pull":  {"mev": 16, "mrv": 24},
        "Upper": {"mev": 32, "mrv": 48},
        "Lower": {"mev": 16, "mrv": 24},
    },
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def to_date_str(val) -> str | None:
    """Convert str, datetime, or date → YYYY-MM-DD string."""
    if val is None:
        return None
    if isinstance(val, str):
        return val[:10] if len(val) >= 10 else None
    if hasattr(val, "strftime"):
        return val.strftime("%Y-%m-%d")
    return None


def clean_exercise(name: str) -> str:
    """Strip superset suffix (e.g. ' ∈ SS1') from exercise name."""
    return SS_PATTERN.sub("", name).strip() if name else ""


def safe_float(val) -> float | None:
    try:
        return float(val) if val is not None else None
    except (ValueError, TypeError):
        return None


def safe_int(val) -> int | None:
    try:
        return int(val) if val is not None else None
    except (ValueError, TypeError):
        return None


# ── MacroFactor XLSX parsing ──────────────────────────────────────────────────

def find_mf_files() -> list[Path]:
    files = sorted(MF_DIR.glob("MacroFactor-*.xlsx"))
    print(f"  Found {len(files)} file(s): {[f.name for f in files]}")
    return files


def parse_quick_export(ws) -> dict:
    """Parse Quick Export sheet → dict keyed by date string."""
    headers = list(next(ws.iter_rows(max_row=1, values_only=True)))
    col = {h: i for i, h in enumerate(headers) if h}

    by_date = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        date = to_date_str(row[0])
        if not date:
            continue
        by_date[date] = {
            "date": date,
            "tdee":              safe_float(row[col["Expenditure"]]) if "Expenditure" in col else None,
            "trend_weight_kg":   safe_float(row[col["Trend Weight (kg)"]]) if "Trend Weight (kg)" in col else None,
            "weight_kg":         safe_float(row[col["Weight (kg)"]]) if "Weight (kg)" in col else None,
            "kcal":              safe_float(row[col["Calories (kcal)"]]) if "Calories (kcal)" in col else None,
            "protein_g":         safe_float(row[col["Protein (g)"]]) if "Protein (g)" in col else None,
            "fat_g":             safe_float(row[col["Fat (g)"]]) if "Fat (g)" in col else None,
            "carbs_g":           safe_float(row[col["Carbs (g)"]]) if "Carbs (g)" in col else None,
            "target_kcal":       safe_float(row[col["Target Calories (kcal)"]]) if "Target Calories (kcal)" in col else None,
            "target_protein_g":  safe_float(row[col["Target Protein (g)"]]) if "Target Protein (g)" in col else None,
            "target_fat_g":      safe_float(row[col["Target Fat (g)"]]) if "Target Fat (g)" in col else None,
            "target_carbs_g":    safe_float(row[col["Target Carbs (g)"]]) if "Target Carbs (g)" in col else None,
            "steps":             safe_int(row[col["Steps"]]) if "Steps" in col else None,
        }
    return by_date


def parse_muscle_sheet(ws) -> dict:
    """
    Parse either Muscle Groups - Sets or Muscle Groups - Volume sheet.
    Column headers like 'Chest (sets)' or 'Chest (kg)' — strip suffix to get muscle name.
    Returns dict keyed by date string.
    """
    headers = list(next(ws.iter_rows(max_row=1, values_only=True)))
    col = {}
    for i, h in enumerate(headers):
        if h and h != "Date":
            muscle = h.replace(" (sets)", "").replace(" (kg)", "").strip()
            col[muscle] = i

    by_date = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        date = to_date_str(row[0])
        if not date:
            continue
        entry = {"date": date}
        for muscle in MUSCLE_GROUPS:
            val = row[col[muscle]] if muscle in col else None
            entry[muscle] = safe_float(val)
        by_date[date] = entry
    return by_date


def parse_workout_log(ws) -> dict:
    """
    Parse Workout Log sheet.
    Groups sets by date → {date, workout_name, duration_sec, sets: [...]}
    """
    headers = list(next(ws.iter_rows(max_row=1, values_only=True)))
    col = {h: i for i, h in enumerate(headers) if h}

    by_date = {}
    for row in ws.iter_rows(min_row=2, values_only=True):
        date = to_date_str(row[0])
        if not date:
            continue

        workout_name = row[col.get("Workout", 2)] or ""
        duration_sec = safe_int(row[col.get("Workout Duration", 1)])
        exercise = clean_exercise(row[col.get("Exercise", 3)] or "")
        set_type = row[col.get("Set Type", 5)] or ""
        weight_kg = safe_float(row[col.get("Weight (kg)", 6)])
        reps = safe_int(row[col.get("Reps", 7)])
        rir_raw = row[col.get("RIR", 8)]
        # RIR may be empty string, None, or int
        rir = safe_int(rir_raw) if rir_raw not in (None, "", "None") else None

        set_entry = {
            "exercise": exercise,
            "set_type": set_type,
            "weight_kg": weight_kg,
            "reps": reps,
            "rir": rir,
        }

        if date not in by_date:
            by_date[date] = {
                "date": date,
                "workout_name": workout_name,
                "duration_sec": duration_sec,
                "sets": [],
            }
        by_date[date]["sets"].append(set_entry)

    return by_date


def load_all_mf_files(files: list[Path]) -> dict:
    """Load all MF XLSX files sorted oldest→newest; later files win on duplicate dates."""
    merged = {
        "daily": {},
        "muscle_sets": {},
        "muscle_volume": {},
        "workouts": {},
    }

    for path in files:
        print(f"\n  [{path.name}]")
        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

        if "Quick Export" in wb.sheetnames:
            d = parse_quick_export(wb["Quick Export"])
            merged["daily"].update(d)
            print(f"    Quick Export       : {len(d)} days")

        if "Muscle Groups - Sets" in wb.sheetnames:
            d = parse_muscle_sheet(wb["Muscle Groups - Sets"])
            merged["muscle_sets"].update(d)
            print(f"    Muscle Groups Sets : {len(d)} days")

        if "Muscle Groups - Volume" in wb.sheetnames:
            d = parse_muscle_sheet(wb["Muscle Groups - Volume"])
            merged["muscle_volume"].update(d)
            print(f"    Muscle Groups Vol  : {len(d)} days")

        if "Workout Log" in wb.sheetnames:
            d = parse_workout_log(wb["Workout Log"])
            merged["workouts"].update(d)
            print(f"    Workout Log        : {len(d)} workout days")

        wb.close()

    return merged


# ── Health Connect parsing ────────────────────────────────────────────────────

def to_hc_date(time_ms: int, zone_s: int) -> str:
    local_ts = (time_ms + (zone_s or 0) * 1000) / 1000
    return datetime.fromtimestamp(local_ts, tz=timezone.utc).strftime("%Y-%m-%d")


def parse_hc_weight(conn: sqlite3.Connection) -> list:
    rows = conn.execute(
        "SELECT weight, time, zone_offset FROM weight_record_table ORDER BY time ASC"
    ).fetchall()
    by_date = {}
    for weight_g, time_ms, zone_s in rows:
        by_date[to_hc_date(time_ms, zone_s or 0)] = round(weight_g / 1000, 2)
    result = [{"date": d, "kg": kg} for d, kg in sorted(by_date.items())]
    print(f"  HC weight : {len(result)} entries")
    return result


def parse_hc_body_fat(conn: sqlite3.Connection) -> list:
    rows = conn.execute(
        "SELECT percentage, time, zone_offset FROM body_fat_record_table ORDER BY time ASC"
    ).fetchall()
    by_date = {}
    for pct, time_ms, zone_s in rows:
        by_date[to_hc_date(time_ms, zone_s or 0)] = round(float(pct), 2)
    result = [{"date": d, "pct": p} for d, p in sorted(by_date.items())]
    print(f"  HC body fat : {len(result)} entries")
    return result


def parse_hc_cardio(conn: sqlite3.Connection) -> list:
    rows = conn.execute("""
        SELECT title, start_time, end_time, start_zone_offset, exercise_type
        FROM exercise_session_record_table
        ORDER BY start_time DESC
    """).fetchall()

    result = []
    for title, start_ms, end_ms, zone_s, ex_type in rows:
        t = (title or "").lower()
        if ex_type == 8 or "vo2" in t or "bike" in t or "cycling" in t:
            session_type = "cardio_vo2"
        elif "padel" in t:
            session_type = "padel"
        else:
            continue
        duration_min = round((end_ms - start_ms) / 1000 / 60)
        result.append({
            "date": to_hc_date(start_ms, zone_s or 0),
            "type": session_type,
            "title": title or "",
            "duration_min": duration_min,
        })

    print(f"  HC cardio : {len(result)} sessions")
    return result


def load_hc_data() -> dict:
    if not HC_DB_PATH.exists():
        print(f"  HC DB not found ({HC_DB_PATH}) — skipping cardio/weight fallback")
        return {"hc_weight": [], "hc_body_fat": [], "cardio": []}

    print(f"  Reading {HC_DB_PATH}...")
    conn = sqlite3.connect(HC_DB_PATH)
    try:
        result = {
            "hc_weight": parse_hc_weight(conn),
            "hc_body_fat": parse_hc_body_fat(conn),
            "cardio": parse_hc_cardio(conn),
        }
    finally:
        conn.close()
    return result


# ── Config ────────────────────────────────────────────────────────────────────

def ensure_config() -> dict:
    if not CONFIG_PATH.exists():
        with open(CONFIG_PATH, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        print(f"  Created {CONFIG_PATH}")
    else:
        print(f"  Loaded  {CONFIG_PATH}")
    with open(CONFIG_PATH) as f:
        return json.load(f)


# ── Merge & output ────────────────────────────────────────────────────────────

def compute_body_comp(weight_series: list, config: dict) -> list:
    """
    Compute BF% estimates (YMCA + Deurenberg), lean mass, FFMI
    for each weight entry that has a trend_kg value.
    Uses fixed waist measurement from config (athlete["waist_cm"]).
    """
    athlete = config["athlete"]
    age = athlete["age"]
    height_m = athlete["height_cm"] / 100.0
    waist_in = athlete["waist_cm"] / 2.54

    result = []
    for entry in weight_series:
        trend_kg = entry.get("trend_kg")
        if trend_kg is None:
            continue

        weight_lb = trend_kg * 2.20462

        # YMCA formula (male): bf% = ((-98.42 + 4.15*waist_in - 0.082*weight_lb) / weight_lb) * 100
        ymca_bf = ((-98.42 + 4.15 * waist_in - 0.082 * weight_lb) / weight_lb) * 100

        # Deurenberg formula: bf% = (1.20*BMI) + (0.23*age) - 10.8 - 5.4
        bmi = trend_kg / (height_m ** 2)
        deur_bf = (1.20 * bmi) + (0.23 * age) - 10.8 - 5.4

        avg_bf = (ymca_bf + deur_bf) / 2.0
        lean_kg = trend_kg * (1.0 - avg_bf / 100.0)
        ffmi = lean_kg / (height_m ** 2)

        result.append({
            "date": entry["date"],
            "trend_kg": round(trend_kg, 2),
            "ymca_bf_pct": round(ymca_bf, 1),
            "deurenberg_bf_pct": round(deur_bf, 1),
            "estimated_bf_pct": round(avg_bf, 1),
            "lean_kg": round(lean_kg, 1),
            "ffmi": round(ffmi, 2),
        })

    return result


def compute_summary(body_comp: list) -> dict:
    """Pre-compute latest values for the Coach Brief card."""
    if not body_comp:
        return {}

    latest = body_comp[-1]

    # 7-day weight delta
    weight_delta_7d = None
    lean_trend = "→"
    if len(body_comp) >= 7:
        week_ago = body_comp[-7]
        weight_delta_7d = round(latest["trend_kg"] - week_ago["trend_kg"], 2)
        lean_delta = latest["lean_kg"] - week_ago["lean_kg"]
        lean_trend = "↑" if lean_delta > 0.3 else ("↓" if lean_delta < -0.3 else "→")

    return {
        "latest_date": latest["date"],
        "trend_kg": latest["trend_kg"],
        "weight_delta_7d": weight_delta_7d,
        "estimated_bf_pct": latest["estimated_bf_pct"],
        "lean_kg": latest["lean_kg"],
        "lean_trend": lean_trend,
        "ffmi": latest["ffmi"],
    }


def build_weight_series(mf_daily: dict, hc_weight: list) -> list:
    """
    Unified weight series: MF trend weight preferred; HC raw weight as fallback.
    """
    hc_by_date = {e["date"]: e["kg"] for e in hc_weight}
    all_dates = sorted(set(mf_daily.keys()) | set(hc_by_date.keys()))
    result = []
    for date in all_dates:
        mf = mf_daily.get(date)
        trend = mf.get("trend_weight_kg") if mf else None
        raw_mf = mf.get("weight_kg") if mf else None
        hc_kg = hc_by_date.get(date)
        result.append({
            "date": date,
            "trend_kg": trend,
            "raw_kg": raw_mf if raw_mf is not None else hc_kg,
            "source": "mf" if raw_mf is not None else ("hc" if hc_kg else "none"),
        })
    return result


def build_output(mf: dict, hc: dict, config: dict) -> dict:
    mf_daily = mf["daily"]
    weight_series = build_weight_series(mf_daily, hc["hc_weight"])
    body_comp = compute_body_comp(weight_series, config)
    return {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "config": config,
        "summary": compute_summary(body_comp),
        "mf_daily": [mf_daily[d] for d in sorted(mf_daily)],
        "muscle_sets": [mf["muscle_sets"][d] for d in sorted(mf["muscle_sets"])],
        "muscle_volume": [mf["muscle_volume"][d] for d in sorted(mf["muscle_volume"])],
        "workouts": [mf["workouts"][d] for d in sorted(mf["workouts"])],
        "weight": weight_series,
        "body_comp": body_comp,
        "hc_body_fat": hc["hc_body_fat"],
        "cardio": hc["cardio"],
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    print("=== Workout Dashboard v2 Parser ===\n")

    print("Config...")
    config = ensure_config()

    print("\nMacroFactor XLSX files...")
    files = find_mf_files()
    if not files:
        print("  ✗ No MacroFactor files found in drive_export/workout/")
        return
    mf = load_all_mf_files(files)

    print("\nHealth Connect data...")
    hc = load_hc_data()

    print("\nAssembling output...")
    data = build_output(mf, hc, config)

    with open(OUT_PATH, "w") as f:
        json.dump(data, f, separators=(",", ":"))

    size_kb = OUT_PATH.stat().st_size / 1024
    s = data.get("summary", {})
    print(f"\n✓ {OUT_PATH}  ({size_kb:.1f} KB)")
    print(f"  mf_daily       : {len(data['mf_daily'])} days")
    print(f"  muscle_sets    : {len(data['muscle_sets'])} days")
    print(f"  muscle_volume  : {len(data['muscle_volume'])} days")
    print(f"  workouts       : {len(data['workouts'])} days")
    print(f"  body_comp      : {len(data['body_comp'])} entries")
    print(f"  weight         : {len(data['weight'])} entries")
    print(f"  hc_body_fat    : {len(data['hc_body_fat'])} entries")
    print(f"  cardio         : {len(data['cardio'])} sessions")
    if s:
        delta = f"{s['weight_delta_7d']:+.2f}" if s.get("weight_delta_7d") is not None else "n/a"
        print(f"\n  Latest ({s['latest_date']}):")
        print(f"    trend weight : {s['trend_kg']} kg  (7d Δ {delta} kg)")
        print(f"    lean mass    : {s['lean_kg']} kg  {s['lean_trend']}")
        print(f"    BF% (est)    : {s['estimated_bf_pct']}%")
        print(f"    FFMI         : {s['ffmi']}")


if __name__ == "__main__":
    main()
