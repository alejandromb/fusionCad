#!/usr/bin/env bash
# Backup fusionCad Postgres database to a timestamped SQL dump.
# Usage: ./scripts/backup-db.sh
#   or:  npm run db:backup

set -euo pipefail

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
CONTAINER="fusion-cad-db"
DB_NAME="fusion_cad"
DB_USER="postgres"

mkdir -p "$BACKUP_DIR"

BACKUP_FILE="$BACKUP_DIR/fusion_cad_${TIMESTAMP}.sql"

echo "Backing up $DB_NAME from container $CONTAINER..."

docker exec "$CONTAINER" pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"

# Compress the backup
gzip "$BACKUP_FILE"
BACKUP_FILE="${BACKUP_FILE}.gz"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo "Backup saved: $BACKUP_FILE ($SIZE)"

# Show recent backups
echo ""
echo "Recent backups:"
ls -lht "$BACKUP_DIR"/*.sql.gz 2>/dev/null | head -5
