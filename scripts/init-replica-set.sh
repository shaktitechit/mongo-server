
#!/usr/bin/env bash
# =============================================================================
# scripts/init-replica-set.sh
#
# Idempotent script to initialize MongoDB Replica Set "rs0".
# Enables Oplog, PITR backups, multi-document transactions, and change streams.
#
# Usage:
#   ./scripts/init-replica-set.sh
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

MONGO_HOST="${MONGO_HOST:-127.0.0.1}"
MONGO_PORT="${MONGO_PORT:-27017}"
USERNAME="${MONGO_ROOT_USERNAME:-admin}"
PASSWORD="${MONGO_ROOT_PASSWORD:-}"
RS_NAME="${REPLICA_SET_NAME:-rs0}"

if [[ -z "${PASSWORD}" ]]; then
  echo "ERROR: MONGO_ROOT_PASSWORD is not set." >&2
  exit 1
fi

echo "==> Checking Replica Set '${RS_NAME}' status on ${MONGO_HOST}:${MONGO_PORT}..."

# Test if running via Docker or direct mongosh
RUN_CMD() {
  if docker compose ps --status running --services 2>/dev/null | grep -qx "mongodb"; then
    docker compose exec -T mongodb mongosh \
      --quiet \
      -u "${USERNAME}" \
      -p "${PASSWORD}" \
      --authenticationDatabase admin \
      --eval "$1"
  else
    mongosh \
      --quiet \
      --host "${MONGO_HOST}" \
      --port "${MONGO_PORT}" \
      -u "${USERNAME}" \
      -p "${PASSWORD}" \
      --authenticationDatabase admin \
      --eval "$1"
  fi
}

# Check if replica set is already initialized
STATUS=$(RUN_CMD "try { rs.status().ok } catch(e) { 0 }" 2>/dev/null || echo "0")

if [[ "${STATUS}" == "1" ]]; then
  echo "==> Replica Set '${RS_NAME}' is ALREADY initialized and healthy."
  exit 0
fi

echo "==> Initializing Replica Set '${RS_NAME}'..."
INIT_RES=$(RUN_CMD "rs.initiate({ _id: '${RS_NAME}', members: [{ _id: 0, host: 'mongodb:27017' }] })")

echo "${INIT_RES}"

echo "==> Waiting for primary election..."
sleep 5

CHECK_PRIMARY=$(RUN_CMD "rs.isMaster().ismaster")
if [[ "${CHECK_PRIMARY}" == "true" ]]; then
  echo "==> Replica Set '${RS_NAME}' successfully initialized! Primary node active."
else
  echo "==> Replica Set initialized. Status check returned: ${CHECK_PRIMARY}"
fi
