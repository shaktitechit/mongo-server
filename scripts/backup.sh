#!/usr/bin/env bash
# =============================================================================
# scripts/backup.sh — Full MongoDB backup (all databases)
#
# Creates a compressed mongodump archive under ./backups/
# Uses the root admin account (administration only).
#
# Usage:
#   ./scripts/backup.sh
#   ./scripts/backup.sh --name pre-migrate
#
# Requires: Docker, docker compose, a running mongodb container, and .env
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Copy .env.example to .env and configure secrets." >&2
  exit 1
fi

# shellcheck disable=SC1091
set -a
# shellcheck source=/dev/null
source .env
set +a

BACKUP_DIR="${ROOT_DIR}/backups"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
LABEL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --name)
      LABEL="_${2//[^a-zA-Z0-9._-]/_}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      exit 1
      ;;
  esac
done

ARCHIVE_NAME="mongodb_full_${STAMP}${LABEL}.archive.gz"
mkdir -p "${BACKUP_DIR}"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "mongodb"; then
  echo "ERROR: mongodb service is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

echo "==> Backing up all databases to backups/${ARCHIVE_NAME}"

# Write directly into the container's /backups mount (./backups on the host).
# This avoids host-side shell redirection / credential quoting issues.
docker compose exec -T mongodb mongodump \
  --username="${MONGO_ROOT_USERNAME}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --gzip \
  --archive="/backups/${ARCHIVE_NAME}"

if [[ ! -s "${BACKUP_DIR}/${ARCHIVE_NAME}" ]]; then
  echo "ERROR: Backup file missing or empty: backups/${ARCHIVE_NAME}" >&2
  exit 1
fi

SIZE="$(du -h "${BACKUP_DIR}/${ARCHIVE_NAME}" | awk '{print $1}')"
echo "==> Backup complete (${SIZE}): ${ARCHIVE_NAME}"

# Optional GPG AES-256 encryption
ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
FINAL_ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}"

if [[ -n "${ENCRYPTION_KEY}" ]]; then
  echo "==> Encrypting backup with AES-256 (GPG)..."
  if command -v gpg &>/dev/null; then
    gpg --batch --yes --symmetric --cipher-algo AES256 --passphrase "${ENCRYPTION_KEY}" --output "${BACKUP_DIR}/${ARCHIVE_NAME}.gpg" "${BACKUP_DIR}/${ARCHIVE_NAME}"
    rm -f "${BACKUP_DIR}/${ARCHIVE_NAME}"
    FINAL_ARCHIVE="${BACKUP_DIR}/${ARCHIVE_NAME}.gpg"
    echo "==> Encrypted backup created: ${ARCHIVE_NAME}.gpg"
  else
    echo "WARNING: gpg is not installed on host. Skipping encryption." >&2
  fi
fi

# Optional Offsite Sync Hook
if [[ -n "${OFFSITE_SYNC_CMD:-}" ]]; then
  echo "==> Syncing backup offsite via OFFSITE_SYNC_CMD..."
  eval "${OFFSITE_SYNC_CMD} \"${FINAL_ARCHIVE}\""
fi

if [[ "${RETENTION_DAYS}" =~ ^[0-9]+$ ]] && [[ "${RETENTION_DAYS}" -gt 0 ]]; then
  echo "==> Pruning backups older than ${RETENTION_DAYS} days"
  find "${BACKUP_DIR}" -type f \( -name 'mongodb_full_*.archive.gz' -o -name 'mongodb_full_*.archive.gz.gpg' \) -mtime "+${RETENTION_DAYS}" -print -delete || true
fi

echo "==> Done"
