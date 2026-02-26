#!/bin/bash
# Update the workout dashboard
# Usage: ./update.sh [/path/to/health_connect_export.db]
#
# 1. Drop new MacroFactor-*.xlsx files into drive_export/workout/
# 2. Run: ./update.sh
# 3. Dashboard updates in ~15 seconds at https://workout-hgi.vercel.app

set -e

# Optionally copy a new Health Connect DB
if [ -n "$1" ]; then
  echo "Copying $1 ..."
  cp "$1" ./health_connect_export.db
fi

echo "Parsing data..."
uv run python parse.py

echo "Committing and pushing..."
git add public/data.json workout-config.json
git commit -m "data: $(date +%Y-%m-%d)" --allow-empty
git push

echo ""
echo "Done! Dashboard will update in ~15 seconds."
echo "https://workout-hgi.vercel.app"
