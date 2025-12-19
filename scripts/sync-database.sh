#!/bin/bash
# Database Sync Script: Render -> Local PostgreSQL
# This script backs up the Render database and restores it to a local PostgreSQL instance

set -e

# Configuration - Render (external URL)
RENDER_HOST="dpg-d4o9vui4d50c738n40dg-a.ohio-postgres.render.com"
RENDER_USER="ironscout"
RENDER_PASS="X9yOiz5SVOUgN5ycNA1ArsPH6J0bs2yk"
RENDER_DB="ironscout"

# Configuration - Local PostgreSQL
LOCAL_HOST="10.10.9.28"
LOCAL_DB="ironscout"
LOCAL_USER="admin"
LOCAL_PASS="M@dison389!"
BACKUP_DIR="S:/workspace/ZeroedIn/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/render_backup_${TIMESTAMP}.sql"
SCHEMA_FILE="${BACKUP_DIR}/render_schema_${TIMESTAMP}.sql"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "=========================================="
echo "Database Sync: Render -> Local"
echo "Timestamp: $TIMESTAMP"
echo "=========================================="

# Step 1: Backup schema only from Render
echo ""
echo "[1/5] Backing up schema from Render..."
PGPASSWORD=X9yOiz5SVOUgN5ycNA1ArsPH6J0bs2yk pg_dump \
    -h dpg-d4o9vui4d50c738n40dg-a \
    -U ironscout \
    -d ironscout \
    --schema-only \
    --no-owner \
    --no-privileges \
    -f "$SCHEMA_FILE"

echo "Schema backup saved to: $SCHEMA_FILE"

# Step 2: Full backup (schema + data) from Render
echo ""
echo "[2/5] Creating full backup from Render (schema + data)..."
PGPASSWORD=X9yOiz5SVOUgN5ycNA1ArsPH6J0bs2yk pg_dump \
    -h dpg-d4o9vui4d50c738n40dg-a \
    -U ironscout \
    -d ironscout \
    --no-owner \
    --no-privileges \
    -f "$BACKUP_FILE"

echo "Full backup saved to: $BACKUP_FILE"

# Step 3: Check if local database exists and prompt for action
echo ""
echo "[3/5] Checking local database..."
echo "Local host: $LOCAL_HOST"
echo "Local database: $LOCAL_DB"
echo ""
echo "WARNING: This will DROP and recreate the local database!"
echo "All existing data in the local database will be lost."
echo ""
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted by user."
    echo ""
    echo "Backup files created:"
    echo "  - Schema: $SCHEMA_FILE"
    echo "  - Full:   $BACKUP_FILE"
    exit 0
fi

# Step 4: Drop and recreate local database
echo ""
echo "[4/5] Recreating local database..."
echo "Enter password for local postgres user:"

# Drop existing connections and database
psql -h "$LOCAL_HOST" -U "$LOCAL_USER" -d postgres <<EOF
SELECT pg_terminate_backend(pg_stat_activity.pid)
FROM pg_stat_activity
WHERE pg_stat_activity.datname = '$LOCAL_DB'
  AND pid <> pg_backend_pid();

DROP DATABASE IF EXISTS $LOCAL_DB;
CREATE DATABASE $LOCAL_DB;
EOF

echo "Local database recreated."

# Step 5: Restore backup to local
echo ""
echo "[5/5] Restoring backup to local database..."
psql -h "$LOCAL_HOST" -U "$LOCAL_USER" -d "$LOCAL_DB" -f "$BACKUP_FILE"

echo ""
echo "=========================================="
echo "Sync complete!"
echo "=========================================="
echo ""
echo "Backup files:"
echo "  - Schema only: $SCHEMA_FILE"
echo "  - Full backup: $BACKUP_FILE"
echo ""
echo "Local database '$LOCAL_DB' on $LOCAL_HOST is now synced with Render."
