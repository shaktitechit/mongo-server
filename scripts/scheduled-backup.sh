#!/usr/bin/env bash
# =============================================================================
# scripts/scheduled-backup.sh
#
# In-container daily backup job (used by the mongo-backup Compose service).
# Connects to hostname "mongodb" on the Docker network and writes to /backups.
#
# Also used by: backup-scheduler-entrypoint.sh
# Manual host backups: use scripts/backup.sh instead.
# =============================================================================

set -euo pipefail

MONGO_HOST="${MONGO_HOST:-mongodb}"
MONGO_PORT="${MONGO_PORT:-27017}"
USERNAME="${MONGO_INITDB_ROOT_USERNAME:-${MONGO_ROOT_USERNAME:-}}"
PASSWORD="${MONGO_INITDB_ROOT_PASSWORD:-${MONGO_ROOT_PASSWORD:-}}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
BACKUP_DIR="${BACKUP_DIR:-/backups}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
ARCHIVE_NAME="mongodb_full_${STAMP}_daily.archive.gz"
ARCHIVE_PATH="${BACKUP_DIR}/${ARCHIVE_NAME}"

if [[ -z "${USERNAME}" || -z "${PASSWORD}" ]]; then
  echo "ERROR: root username/password env vars are not set." >&2
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup → ${ARCHIVE_PATH}"

mongodump \
  --host="${MONGO_HOST}" \
  --port="${MONGO_PORT}" \
  --username="${USERNAME}" \
  --password="${PASSWORD}" \
  --authenticationDatabase=admin \
  --gzip \
  --archive="${ARCHIVE_PATH}"

if [[ ! -s "${ARCHIVE_PATH}" ]]; then
  echo "ERROR: Backup file missing or empty: ${ARCHIVE_PATH}" >&2
  exit 1
fi

SIZE="$(du -h "${ARCHIVE_PATH}" | awk '{print $1}')"
echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Backup complete (${SIZE}): ${ARCHIVE_NAME}"

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Pruning backups older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -type f -name 'mongodb_full_*.archive.gz' -mtime "+${RETENTION_DAYS}" -print -delete || true
fi

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Done"
