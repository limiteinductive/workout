#!/usr/bin/env python3
"""
Parse Health Connect SQLite export into public/data.json
Usage: python parse.py [path/to/health_connect_export.db]
Default DB path: ./health_connect_export.db
"""

import sqlite3
import json
import sys
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from pathlib import Path

DB_PATH = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("health_connect_export.db")
OUT_PATH = Path("public/data.json")

REQUIRED_TABLES = [
    "weight_record_table",
    "body_fat_record_table",
    "nutrition_record_table",
    "exercise_session_record_table",
    "exercise_segments_table",
]


def to_local_date(time_ms: int, zone_offset_s: int) -> str:
    """Convert Unix ms timestamp + zone offset (seconds) to local YYYY-MM-DD."""
    local_ts = (time_ms + zone_offset_s * 1000) / 1000
    return datetime.fromtimestamp(local_ts, tz=timezone.utc).strftime("%Y-%m-%d")


def to_local_datetime(time_ms: int, zone_offset_s: int) -> str:
    """Convert Unix ms timestamp + zone offset to local ISO datetime string."""
    local_ts = (time_ms + zone_offset_s * 1000) / 1000
    return datetime.fromtimestamp(local_ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S")


def validate_tables(conn: sqlite3.Connection):
    cursor = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing = {row[0] for row in cursor.fetchall()}
    missing = [t for t in REQUIRED_TABLES if t not in existing]
    if missing:
        raise RuntimeError(f"Missing expected tables: {missing}")
    print(f"✓ All required tables present")


def parse_weight(conn: sqlite3.Connection) -> list:
    rows = conn.execute("""
        SELECT weight, time, zone_offset
        FROM weight_record_table
        ORDER BY time ASC
    """).fetchall()

    # One entry per day (keep last reading of the day)
    by_date = {}
    for weight_g, time_ms, zone_s in rows:
        date = to_local_date(time_ms, zone_s or 0)
        by_date[date] = round(weight_g / 1000, 2)

    result = [{"date": d, "kg": kg} for d, kg in sorted(by_date.items())]
    print(f"✓ Weight: {len(result)} daily entries")
    return result


def parse_body_fat(conn: sqlite3.Connection) -> list:
    rows = conn.execute("""
        SELECT percentage, time, zone_offset
        FROM body_fat_record_table
        ORDER BY time ASC
    """).fetchall()

    by_date = {}
    for pct, time_ms, zone_s in rows:
        date = to_local_date(time_ms, zone_s or 0)
        by_date[date] = round(pct, 2)

    result = [{"date": d, "pct": p} for d, p in sorted(by_date.items())]
    print(f"✓ Body fat: {len(result)} entries")
    return result


def parse_nutrition(conn: sqlite3.Connection) -> list:
    rows = conn.execute("""
        SELECT energy, protein, total_carbohydrate, total_fat,
               start_time, start_zone_offset
        FROM nutrition_record_table
        ORDER BY start_time ASC
    """).fetchall()

    # Aggregate by local date
    by_date = defaultdict(lambda: {"kcal": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0})

    for energy, protein, carbs, fat, time_ms, zone_s in rows:
        date = to_local_date(time_ms, zone_s or 0)
        d = by_date[date]
        # Energy stored in small calories (cal) → divide by 1000 → kcal
        d["kcal"] += (energy or 0) / 1000
        d["protein_g"] += (protein or 0)
        d["carbs_g"] += (carbs or 0)
        d["fat_g"] += (fat or 0)

    result = []
    for date in sorted(by_date.keys()):
        d = by_date[date]
        result.append({
            "date": date,
            "kcal": round(d["kcal"], 1),
            "protein_g": round(d["protein_g"], 1),
            "carbs_g": round(d["carbs_g"], 1),
            "fat_g": round(d["fat_g"], 1),
        })

    print(f"✓ Nutrition: {len(result)} daily entries")
    return result


def parse_workouts(conn: sqlite3.Connection) -> list:
    sessions = conn.execute("""
        SELECT row_id, title, start_time, end_time,
               start_zone_offset, exercise_type
        FROM exercise_session_record_table
        ORDER BY start_time DESC
    """).fetchall()

    # Fetch all segments grouped by parent session
    seg_rows = conn.execute("""
        SELECT parent_key, segment_type, repetitions_count,
               weight_grams, set_index
        FROM exercise_segments_table
        ORDER BY parent_key, segment_start_time ASC
    """).fetchall()

    segments_by_session = defaultdict(list)
    for parent_key, seg_type, reps, weight_g, set_idx in seg_rows:
        seg = {"type_id": seg_type, "reps": reps}
        if weight_g and weight_g > 0:
            seg["weight_kg"] = round(weight_g / 1000, 2)
        if set_idx and set_idx >= 0:
            seg["set_index"] = set_idx
        segments_by_session[parent_key].append(seg)

    result = []
    for row_id, title, start_ms, end_ms, zone_s, ex_type in sessions:
        zone = zone_s or 0
        duration_min = round((end_ms - start_ms) / 1000 / 60)
        result.append({
            "date": to_local_date(start_ms, zone),
            "datetime": to_local_datetime(start_ms, zone),
            "title": title or "",
            "duration_min": duration_min,
            "exercise_type": ex_type,
            "segments": segments_by_session.get(row_id, []),
        })

    print(f"✓ Workouts: {len(result)} sessions")
    return result


def main():
    if not DB_PATH.exists():
        print(f"✗ DB not found: {DB_PATH}")
        sys.exit(1)

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)

    print(f"Parsing {DB_PATH} ...")
    conn = sqlite3.connect(DB_PATH)

    try:
        validate_tables(conn)

        data = {
            "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "weight": parse_weight(conn),
            "body_fat": parse_body_fat(conn),
            "nutrition": parse_nutrition(conn),
            "workouts": parse_workouts(conn),
        }
    finally:
        conn.close()

    with open(OUT_PATH, "w") as f:
        json.dump(data, f, indent=2)

    size_kb = OUT_PATH.stat().st_size / 1024
    print(f"\n✓ Written to {OUT_PATH} ({size_kb:.1f} KB)")
    print(f"  weight entries    : {len(data['weight'])}")
    print(f"  body fat entries  : {len(data['body_fat'])}")
    print(f"  nutrition days    : {len(data['nutrition'])}")
    print(f"  workout sessions  : {len(data['workouts'])}")


if __name__ == "__main__":
    main()
