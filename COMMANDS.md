# Commands & Usage

Quick reference for operating this MongoDB server (local macOS or Ubuntu VPS).

All commands are run from the repository root unless noted.

```bash
cd /path/to/mongo-server
```

---

## 1. First-time setup

```bash
# Copy environment template
cp .env.example .env

# Generate a strong password (run once per secret in .env)
openssl rand -hex 32

# Edit .env — replace every CHANGE_ME_* value
nano .env   # or open in your editor
```

Required secrets in `.env`:

| Variable | Purpose |
|----------|---------|
| `MONGO_ROOT_PASSWORD` | Admin only (backups, user management) |
| `OPMS_DB_PASSWORD` | OPMS app |
| `CRM_DB_PASSWORD` | CRM app |
| `WEBSITE_DB_PASSWORD` | Website app |
| `INVENTORY_DB_PASSWORD` | Inventory app |
| `ANALYTICS_DB_PASSWORD` | Analytics app |
| `POWERAPP_DB_PASSWORD` | Power App |

> Never commit `.env`. Apps must use their own user — never the root account.

---

## 2. Start / stop / status

| Action | Command |
|--------|---------|
| Start (detached) | `docker compose up -d` |
| Stop (keep container) | `docker compose stop` |
| Stop & remove containers | `docker compose down` |
| Restart | `docker compose restart` |
| Status | `docker compose ps` |
| Recreate with new `.env` | `docker compose --env-file .env up -d` |

```bash
# Start
docker compose up -d

# Check health
docker compose ps
```

Data in `./data` is **kept** on `down`. Only delete `./data` if you intend a full wipe and re-init.

---

## 3. Logs

```bash
# Follow live logs
docker compose logs -f mongodb

# Last 200 lines
docker compose logs --tail=200 mongodb
```

---

## 4. Shell access (mongosh)

```bash
# Load credentials from .env
set -a && source .env && set +a

# Admin shell (root — administration only)
docker compose exec -it mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin

# Ping
docker compose exec -T mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'db.adminCommand({ ping: 1 })'

# List databases
docker compose exec -T mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'db.adminCommand("listDatabases")'
```

---

## 5. Backup

### Automatic (recommended)

The `mongo-backup` service runs a full dump **every day at 02:00 UTC** and deletes
archives older than **30 days** (`BACKUP_RETENTION_DAYS`).

```bash
# Start MongoDB + scheduler
docker compose up -d

# Watch scheduler logs
docker compose logs -f mongo-backup
```

Configure in `.env`:

```env
BACKUP_RETENTION_DAYS=30
BACKUP_SCHEDULE_HOUR=2
BACKUP_SCHEDULE_MINUTE=0
BACKUP_RUN_ON_STARTUP=false
```

### Manual

```bash
# Full backup of all databases → backups/
./scripts/backup.sh

# Named backup (useful before upgrades)
./scripts/backup.sh --name pre-upgrade

# Help
./scripts/backup.sh --help
```

**Output:**

- Automatic: `backups/mongodb_full_<UTC-timestamp>_daily.archive.gz`
- Manual: `backups/mongodb_full_<UTC-timestamp>[_name].archive.gz`

---

## 6. Restore

```bash
# Interactive (type "restore" to confirm)
./scripts/restore.sh backups/mongodb_full_YYYYMMDDThhmmssZ.archive.gz

# Non-interactive
./scripts/restore.sh backups/mongodb_full_YYYYMMDDThhmmssZ.archive.gz --yes
```

> Uses `mongorestore --drop` — existing collections may be overwritten. Take a fresh backup first.

Archive files **must** live under `./backups/` (mounted into the container).

---

## 7. Create a new database & user

`init/init.js` runs **only on first boot** (empty `./data`). For later databases:

```bash
./scripts/create-user.sh <db_name> <username> <password>

# Example
./scripts/create-user.sh reporting reporting_user "$(openssl rand -hex 32)"
```

Then add matching variables to `.env` / `.env.example` for documentation.

If the user already exists, the script **updates** password and roles (`readWrite` on that DB only).

---

## 8. Connection strings

### Local / same host

```text
mongodb://opms_user:<PASSWORD>@127.0.0.1:27017/opms?authSource=opms
mongodb://crm_user:<PASSWORD>@127.0.0.1:27017/crm?authSource=crm
mongodb://website_user:<PASSWORD>@127.0.0.1:27017/website?authSource=website
mongodb://inventory_user:<PASSWORD>@127.0.0.1:27017/inventory?authSource=inventory
mongodb://analytics_user:<PASSWORD>@127.0.0.1:27017/analytics?authSource=analytics
mongodb://powerapp_user:<PASSWORD>@127.0.0.1:27017/powerapp?authSource=powerapp
```

### Admin (Compass / ops only)

```text
mongodb://admin:<MONGO_ROOT_PASSWORD>@127.0.0.1:27017/?authSource=admin
```

### App container on Docker network `mongo-net`

```text
mongodb://opms_user:<PASSWORD>@mongodb:27017/opms?authSource=opms
```

Attach another Compose project:

```yaml
services:
  my-app:
    networks:
      - mongo-net

networks:
  mongo-net:
    external: true
    name: mongo-net
```

---

## 9. MongoDB Compass

### Local MongoDB

1. Start stack: `docker compose up -d`
2. Compass → New connection → paste URI from [§8](#8-connection-strings)

### VPS MongoDB from your laptop

Do **not** open port `27017` publicly. Use an SSH tunnel:

```bash
# Keep this terminal open
ssh -L 27017:127.0.0.1:27017 user@your-vps-ip
```

Then in Compass use the same `127.0.0.1` URI (local or admin) as above.

---

## 10. Update MongoDB image

```bash
./scripts/backup.sh --name pre-mongo-upgrade

# Edit MONGO_IMAGE in .env if needed (e.g. mongo:8.2)
docker compose pull mongodb
docker compose up -d mongodb

docker compose logs --tail=100 mongodb
```

---

## 11. Deploy / update on Ubuntu VPS

```bash
# First deploy
git clone <YOUR_REPO_URL> /opt/mongodb-server
cd /opt/mongodb-server
cp .env.example .env
chmod 600 .env
nano .env          # set secrets; keep MONGO_HOST_BIND=127.0.0.1
docker compose up -d
./scripts/backup.sh --name initial

# Later updates
cd /opt/mongodb-server
./scripts/backup.sh --name pre-pull
git pull
docker compose pull
docker compose up -d
```

Firewall: allow SSH only; **do not** publish `27017` to the world.

---

## 12. Environment variables (reference)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_IMAGE` | `mongo:8.2` | Docker image tag |
| `MONGO_HOST_BIND` | `127.0.0.1` | Host bind address |
| `MONGO_PORT` | `27017` | Host port |
| `MONGO_ROOT_USERNAME` | `admin` | Root user |
| `MONGO_ROOT_PASSWORD` | *(required)* | Root password |
| `*_DB_NAME` / `*_DB_USER` / `*_DB_PASSWORD` | per app | App DB credentials |
| `BACKUP_RETENTION_DAYS` | `30` | Auto-delete backups older than N days |
| `BACKUP_SCHEDULE_HOUR` | `2` | Daily backup hour (UTC) |
| `BACKUP_SCHEDULE_MINUTE` | `0` | Daily backup minute (UTC) |
| `BACKUP_RUN_ON_STARTUP` | `false` | Run one backup when scheduler starts |

---

## 13. Databases & users

| Application | Database   | User            | Role |
|-------------|------------|-----------------|------|
| OPMS        | `opms`     | `opms_user`     | `readWrite` |
| CRM         | `crm`      | `crm_user`      | `readWrite` |
| Website     | `website`  | `website_user`  | `readWrite` |
| Inventory   | `inventory`| `inventory_user`| `readWrite` |
| Analytics   | `analytics`| `analytics_user`| `readWrite` |
| Power App   | `powerapp` | `powerapp_user` | `readWrite` |
| *(admin)*   | `admin`    | `admin` (root)  | full admin |

---

## 14. Script cheat sheet

| Script | Usage |
|--------|--------|
| `./scripts/backup.sh` | Manual full backup |
| `./scripts/backup.sh --name LABEL` | Named full backup |
| `./scripts/restore.sh <file>` | Restore (confirm) |
| `./scripts/restore.sh <file> --yes` | Restore (no prompt) |
| `./scripts/create-user.sh <db> <user> <pass>` | Create/update DB user |
| `scripts/scheduled-backup.sh` | Used by `mongo-backup` container (not for host) |

---

## 15. Common problems

| Problem | Fix |
|---------|-----|
| `CHANGE_ME` rejected on first start | Replace placeholders in `.env`, wipe `./data` only if first boot failed mid-way |
| Auth failed after editing `.env` | Passwords in `./data` are not updated by `.env`; use `create-user.sh` or update via mongosh |
| Auth failed after regenerating `.env` | Shell-exported vars override `.env` — `unset MONGO_ROOT_PASSWORD` (etc.), recreate container |
| Init users missing | `init.js` runs only once; use `./scripts/create-user.sh` |
| Port in use | Change `MONGO_PORT` in `.env` |
| Can't reach from another machine | Expected with `127.0.0.1` — use SSH tunnel or `mongo-net` |

Destructive re-init (erases all data):

```bash
docker compose down
rm -rf data/*
docker compose up -d
```
