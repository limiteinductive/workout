#!/bin/bash
# Update the workout dashboard with a new Health Connect export
# Usage: ./update.sh /path/to/health_connect_export.db

set -e

if [ -z "$1" ]; then
  echo "Usage: ./update.sh /path/to/health_connect_export.db"
  exit 1
fi

echo "Copying $1 ..."
cp "$1" ./health_connect_export.db

echo "Parsing data..."
python3 parse.py

echo "Committing and pushing..."
git add public/data.json
git commit -m "data: $(date +%Y-%m-%d)"
git push

echo ""
echo "Done! Dashboard will update in ~15 seconds."
echo "https://workout-hgi.vercel.app"
