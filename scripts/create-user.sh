#!/usr/bin/env bash
# =============================================================================
# scripts/create-user.sh — Create a new database + scoped application user
#
# Use this AFTER the stack is already initialized (init.js only runs once).
# The new user receives readWrite on the specified database only.
#
# Usage:
#   ./scripts/create-user.sh <db_name> <username> <password>
#   ./scripts/create-user.sh reporting reporting_user '$(openssl rand -base64 24)'
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
source .env
set +a

DB_NAME="${1:-}"
USERNAME="${2:-}"
PASSWORD="${3:-}"

if [[ -z "${DB_NAME}" || -z "${USERNAME}" || -z "${PASSWORD}" ]]; then
  echo "Usage: $0 <db_name> <username> <password>" >&2
  exit 1
fi

if [[ "${PASSWORD}" == CHANGE_ME* ]]; then
  echo "ERROR: Refusing placeholder password. Generate one with: openssl rand -base64 32" >&2
  exit 1
fi

if ! docker compose ps --status running --services 2>/dev/null | grep -qx "mongodb"; then
  echo "ERROR: mongodb service is not running. Start it with: docker compose up -d" >&2
  exit 1
fi

# Escape for embedding inside a single-quoted mongosh --eval is awkward;
# pass values via environment into a small JS snippet instead.
echo "==> Creating database '${DB_NAME}' and user '${USERNAME}' (readWrite only)"

docker compose exec -T \
  -e NEW_DB_NAME="${DB_NAME}" \
  -e NEW_DB_USER="${USERNAME}" \
  -e NEW_DB_PASSWORD="${PASSWORD}" \
  mongodb mongosh \
  --quiet \
  --username="${MONGO_ROOT_USERNAME}" \
  --password="${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase=admin \
  --eval '
    const dbName = process.env.NEW_DB_NAME;
    const user = process.env.NEW_DB_USER;
    const pwd = process.env.NEW_DB_PASSWORD;
    const appDb = db.getSiblingDB(dbName);
    if (appDb.getUser(user)) {
      print(`User "${user}" already exists on "${dbName}". Updating password + roles.`);
      appDb.updateUser(user, {
        pwd,
        roles: [{ role: "readWrite", db: dbName }],
      });
    } else {
      appDb.createUser({
        user,
        pwd,
        roles: [{ role: "readWrite", db: dbName }],
      });
      print(`Created user "${user}" with readWrite on "${dbName}".`);
    }
    if (!appDb.getCollectionNames().includes("_init")) {
      appDb.createCollection("_init");
      appDb.getCollection("_init").insertOne({ initializedAt: new Date() });
    }
  '

echo "==> Done"
echo
echo "Connection string example:"
echo "  mongodb://${USERNAME}:<password>@127.0.0.1:${MONGO_PORT:-27017}/${DB_NAME}?authSource=${DB_NAME}"
echo
echo "Store the password in the application .env — never commit it to Git."
echo "Also add matching variables to this repo's .env / .env.example for documentation."
