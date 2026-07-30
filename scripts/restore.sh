#!/usr/bin/env bash
# =============================================================================
# scripts/restore.sh — Restore MongoDB from a full backup archive
#
# WARNING: This overwrites data in the running MongoDB instance.
#          Take a fresh backup before restoring whenever possible.
#
# Usage:
#   ./scripts/restore.sh backups/mongodb_full_YYYYMMDDThhmmssZ.archive.gz
#   ./scripts/restore.sh backups/mongodb_full_....archive.gz --yes
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

ASSUME_YES=0
ARCHIVE_PATH=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y)
      ASSUME_YES=1
      shift
      ;;
    -h|--help)
      sed -n '2,18p' "$0"
      exit 0
      ;;
    *)
      ARCHIVE_PATH="$1"
      shift
      ;;
  esac
done

if [[ -z "${ARCHIVE_PATH}" ]]; then
  echo "Usage: $0 <path-to-archive.gz> [--yes]" >&2
  echo "Available backups:" >&2
  ls -1 backups/mongodb_full_*.archive.gz 2>/dev/null || echo "  (none found in backups/)" >&2
  exit 1
fi

# Allow relative paths from repo root
if [[ ! -f "${ARCHIVE_PATH}" && -f "${ROOT_DIR}/${ARCHIVE_PATH}" ]]; then
  ARCHIVE_PATH="${ROOT_DIR}/${ARCHIVE_PATH}"
fi

if [[ ! -f "${ARCHIVE_PATH}" ]]; then
  echo "ERROR: Backup file not found: ${ARCHIVE_PATH}" >&2
  exit 1
fi

# Resolve to a file that exists inside the container via the ./backups mount
ARCHIVE_ABS="$(cd "$(dirname "${ARCHIVE_PATH}")" && pwd)/$(basename "${ARCHIVE_PATH}")"
BACKUP_ROOT="$(cd "${ROOT_DIR}/backups" && pwd)"
case "${ARCHIVE_ABS}" in
  "${BACKUP_ROOT}"/*) ;;
  *)
    echo "ERROR: Backup must live under ${ROOT_DIR}/backups (mounted at /backups in the container)." >&2
    exit 1
    ;;
esac

CONTAINER_ARCHIVE="/backups/$(basename "${ARCHIVE_ABS}")"

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "mongodb"; then
  echo "ERROR: mongodb service is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

echo "WARNING: This will restore from:"
echo "  ${ARCHIVE_ABS}"
echo "Existing data may be overwritten (mongorestore --drop)."
echo

if [[ "${ASSUME_YES}" -ne 1 ]]; then
  read -r -p "Type 'restore' to continue: " CONFIRM
  if [[ "${CONFIRM}" != "restore" ]]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Restoring from ${CONTAINER_ARCHIVE} ..."

docker compose exec -T mongodb mongorestore \
  --username="${MONGO_ROOT_USERNAME}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --gzip \
  --archive="${CONTAINER_ARCHIVE}" \
  --drop

echo "==> Restore complete"
echo "==> Verify connectivity with mongosh using your application or root credentials."
