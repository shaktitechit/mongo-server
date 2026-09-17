#!/usr/bin/env bash
# =============================================================================
# scripts/verify-backup.sh
#
# Automated backup integrity verification script.
# Tests decrypting (if encrypted) and dry-run restoring a MongoDB dump archive.
#
# Usage:
#   ./scripts/verify-backup.sh [path/to/archive.gz]
# =============================================================================

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT_DIR}"

if [[ -f .env ]]; then
  # shellcheck disable=SC1091
  set -a
  source .env
  set +a
fi

BACKUP_DIR="${ROOT_DIR}/backups"
ARCHIVE_PATH="${1:-}"

if [[ -z "${ARCHIVE_PATH}" ]]; then
  # Default to latest backup archive
  ARCHIVE_PATH="$(find "${BACKUP_DIR}" -type f \( -name '*.archive.gz' -o -name '*.archive.gz.gpg' \) | sort -r | head -n 1)"
fi

if [[ -z "${ARCHIVE_PATH}" || ! -f "${ARCHIVE_PATH}" ]]; then
  echo "ERROR: No backup archive found to verify." >&2
  exit 1
fi

echo "==> Verifying backup archive: ${ARCHIVE_PATH}"

# Check file size
SIZE=$(du -h "${ARCHIVE_PATH}" | awk '{print $1}')
echo "==> File size: ${SIZE}"

WORKING_ARCHIVE="${ARCHIVE_PATH}"
TMP_DECRYPT=""

# Handle GPG decryption if needed
if [[ "${ARCHIVE_PATH}" == *.gpg ]]; then
  ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:-}"
  if [[ -z "${ENCRYPTION_KEY}" ]]; then
    echo "ERROR: Archive is encrypted (.gpg) but BACKUP_ENCRYPTION_KEY is not set in .env." >&2
    exit 1
  fi
  TMP_DECRYPT="$(mktemp "${BACKUP_DIR}/tmp_verify_XXXXXX.archive.gz")"
  echo "==> Decrypting archive to temporary location..."
  gpg --batch --yes --decrypt --passphrase "${ENCRYPTION_KEY}" --output "${TMP_DECRYPT}" "${ARCHIVE_PATH}"
  WORKING_ARCHIVE="${TMP_DECRYPT}"
fi

# Cleanup trap
cleanup() {
  if [[ -n "${TMP_DECRYPT}" && -f "${TMP_DECRYPT}" ]]; then
    rm -f "${TMP_DECRYPT}"
  fi
}
trap cleanup EXIT

# Get relative path inside container mount /backups
CONTAINER_ARCHIVE="/backups/$(basename "${WORKING_ARCHIVE}")"

echo "==> Running dry-run verification via mongorestore inside container..."
if ! docker compose ps --status running --services 2>/dev/null | grep -qx "mongodb"; then
  echo "ERROR: mongodb service is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

# Dry-run restore
docker compose exec -T mongodb mongorestore \
  --username="${MONGO_ROOT_USERNAME}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --gzip \
  --archive="${CONTAINER_ARCHIVE}" \
  --dryRun

echo "==> SUCCESS: Backup archive integrity verified cleanly!"
