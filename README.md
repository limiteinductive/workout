# Workout Dashboard

Personal fitness dashboard for sharing progress with my coach.

**Live:** https://workout-hgi.vercel.app

## What it shows

- Weight trend
- Body fat %
- Workout sessions with sets & reps
- Daily nutrition (calories, protein, carbs, fat)

Data comes from a daily [Health Connect](https://health.google/health-connect-android/) export.

## How to update

1. Export `health_connect_export.db` from Health Connect on Android
2. Run:

```bash
./update.sh /path/to/health_connect_export.db
```

That's it — the dashboard updates automatically in ~15 seconds.

## Google Drive

Workout data and exports are also backed up here:
https://drive.google.com/drive/folders/1glsuyQbSMLym6uynakK4S-Qxj-29pidA
