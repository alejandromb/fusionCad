#!/usr/bin/env bash
# Backup fusionCad Postgres database to a timestamped SQL dump.
# Auto-prunes old backups using a tiered retention policy:
#   - Keep last 24 hourly backups
#   - Keep one backup per day for the last 7 days
#   - Keep one backup per week beyond that
#
# Usage: ./scripts/backup-db.sh
#   or:  npm run db:backup
#
# For automatic hourly backups, install the launchd job:
#   ./scripts/install-backup-cron.sh

set -euo pipefail

# Resolve script directory so this works when run from anywhere (cron, launchd, etc.)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$PROJECT_ROOT/backups"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER="fusion-cad-db"
DB_NAME="fusion_cad"
DB_USER="postgres"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/fusion_cad_${TIMESTAMP}.sql"

# Verify the container is running before attempting backup
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"; then
  echo "ERROR: container $CONTAINER is not running. Skipping backup."
  exit 1
fi

echo "Backing up $DB_NAME from container $CONTAINER..."
docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Compress
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"

# ─── Tiered retention ──────────────────────────────────────────────
#
# Algorithm:
#   1. Keep all backups from the last 24 hours
#   2. Keep one backup per day for backups 1-7 days old
#   3. Keep one backup per week for backups older than 7 days
#   4. Delete everything else
#
# This gives you fine-grained recent history and longer-term snapshots
# without unbounded disk growth.

cd "$BACKUP_DIR"

# Build the keep list
KEEP_LIST=$(mktemp)
trap 'rm -f "$KEEP_LIST"' EXIT

NOW_EPOCH=$(date +%s)
DAY_SEC=86400

for f in fusion_cad_*.sql.gz; do
  [ -e "$f" ] || continue
  # Extract timestamp from filename (fusion_cad_YYYYMMDD_HHMMSS.sql.gz)
  ts=$(echo "$f" | sed -E 's/fusion_cad_([0-9]{8})_([0-9]{6})\.sql\.gz/\1 \2/')
  if [ -z "$ts" ]; then continue; fi
  date_part=$(echo "$ts" | awk '{print $1}')
  time_part=$(echo "$ts" | awk '{print $2}')
  # macOS date parsing
  file_epoch=$(date -j -f "%Y%m%d %H%M%S" "$date_part $time_part" "+%s" 2>/dev/null || echo 0)
  [ "$file_epoch" = "0" ] && continue

  age_sec=$((NOW_EPOCH - file_epoch))
  age_days=$((age_sec / DAY_SEC))

  if [ $age_days -le 1 ]; then
    # Tier 1: keep all backups within last 24h
    echo "$f" >> "$KEEP_LIST"
  elif [ $age_days -le 7 ]; then
    # Tier 2: keep one per day (the latest of each day)
    day_key=$(echo "$date_part")
    echo "$day_key $f" >> "$KEEP_LIST.daily"
  else
    # Tier 3: keep one per week
    # Compute ISO week number
    week_key=$(date -j -f "%Y%m%d" "$date_part" "+%Y-W%V" 2>/dev/null || continue)
    echo "$week_key $f" >> "$KEEP_LIST.weekly"
  fi
done

# For tiered files, keep the LATEST entry per key
if [ -f "$KEEP_LIST.daily" ]; then
  sort -k1,1 -k2,2 "$KEEP_LIST.daily" | awk '{day=$1; file=$2; latest[day]=file} END {for (d in latest) print latest[d]}' >> "$KEEP_LIST"
  rm -f "$KEEP_LIST.daily"
fi
if [ -f "$KEEP_LIST.weekly" ]; then
  sort -k1,1 -k2,2 "$KEEP_LIST.weekly" | awk '{wk=$1; file=$2; latest[wk]=file} END {for (w in latest) print latest[w]}' >> "$KEEP_LIST"
  rm -f "$KEEP_LIST.weekly"
fi

# Delete anything not in the keep list
DELETED=0
for f in fusion_cad_*.sql.gz; do
  [ -e "$f" ] || continue
  if ! grep -qFx "$f" "$KEEP_LIST"; then
    rm -f "$f"
    DELETED=$((DELETED + 1))
  fi
done

KEPT=$(wc -l < "$KEEP_LIST" | tr -d ' ')
echo ""
echo "Retention: kept $KEPT backup(s), deleted $DELETED old backup(s)"
echo ""
echo "Recent backups:"
ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -10
