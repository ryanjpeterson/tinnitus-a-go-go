#!/usr/bin/env bash
# backup.sh — hourly Postgres + MinIO backup with rolling 3-backup rotation
# Run on the Mac mini via cron. See README for setup instructions.
set -euo pipefail

# ─── CONFIG ─────────────────────────────────────────────────────────────────────
# Rolling window — how many of each backup to keep
MAX_BACKUPS=3

# Project directory on this machine
COMPOSE_DIR="$HOME/Development/tinnitus-a-go-go"
# ───────────────────────────────────────────────────────────────────────────────

TIMESTAMP=$(date +%Y-%m-%d-%H%M)
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')]"

# ── helper: read a value from .env without sourcing the whole file ──────────────
env_val() { grep -E "^$1=" "$COMPOSE_DIR/.env" | head -1 | cut -d= -f2- | tr -d '"'"'"; }

# ── Backup destination — required; set TAGG_BACKUP_DIR in .env ──────────────────
BACKUP_DIR=$(env_val TAGG_BACKUP_DIR)
if [[ -z "$BACKUP_DIR" ]]; then
  echo "$LOG_PREFIX ERROR: TAGG_BACKUP_DIR is not set in $COMPOSE_DIR/.env" >&2
  exit 1
fi

POSTGRES_USER=$(env_val POSTGRES_USER)
POSTGRES_DB=$(env_val POSTGRES_DB)
MINIO_ROOT_USER=$(env_val MINIO_ROOT_USER)
MINIO_ROOT_PASSWORD=$(env_val MINIO_ROOT_PASSWORD)
MINIO_BUCKET=$(env_val MINIO_BUCKET)

mkdir -p "$BACKUP_DIR"

echo "$LOG_PREFIX ── Backup $TIMESTAMP ──"

# ── 1. Postgres dump ─────────────────────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db-$TIMESTAMP.sql.gz"
echo "$LOG_PREFIX Dumping database…"
docker compose -f "$COMPOSE_DIR/docker-compose.yml" \
  --project-directory "$COMPOSE_DIR" \
  exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$DB_FILE"
echo "$LOG_PREFIX Database → $DB_FILE ($(du -sh "$DB_FILE" | cut -f1))"

# ── 2. MinIO media mirror ─────────────────────────────────────────────────────
MEDIA_DIR="$BACKUP_DIR/media-$TIMESTAMP"
echo "$LOG_PREFIX Mirroring media…"
mkdir -p "$MEDIA_DIR"
# Ensure mc alias points at the local stack
mc alias set tagg-local http://localhost:9000 \
  "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" --quiet > /dev/null
mc mirror --quiet "tagg-local/$MINIO_BUCKET" "$MEDIA_DIR/"
echo "$LOG_PREFIX Media    → $MEDIA_DIR ($(du -sh "$MEDIA_DIR" | cut -f1))"

# ── 3. Rotate — keep last MAX_BACKUPS of each type ───────────────────────────
echo "$LOG_PREFIX Rotating (keeping last $MAX_BACKUPS)…"
# shellcheck disable=SC2012
ls -t "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null \
  | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -f
# shellcheck disable=SC2012
ls -dt "$BACKUP_DIR"/media-* 2>/dev/null \
  | tail -n +$((MAX_BACKUPS + 1)) | xargs -r rm -rf

echo "$LOG_PREFIX Done. Contents of $BACKUP_DIR:"
ls -lh "$BACKUP_DIR" | tail -n +2
