# MongoDB Server

Production-ready, self-hosted **MongoDB Community** infrastructure for multiple applications.

This repository contains **only** MongoDB infrastructure — no application code. It is designed to run unchanged on:

- **macOS** (local development)
- **Ubuntu VPS** (production), deployed via Git

Applications that share this server:

| Application | Database   | User            | Privileges              |
|-------------|------------|-----------------|-------------------------|
| OPMS        | `opms`     | `opms_user`     | `readWrite` on `opms`   |
| CRM         | `crm`      | `crm_user`      | `readWrite` on `crm`    |
| Website     | `website`  | `website_user`  | `readWrite` on `website`|
| Inventory   | `inventory`| `inventory_user`| `readWrite` on `inventory` |
| Analytics   | `analytics`| `analytics_user`| `readWrite` on `analytics` |
| Power App   | `powerapp` | `powerapp_user` | `readWrite` on `powerapp`  |

The **root** account is for administration, backups, and user management only. **No application should use the root account.**

---

## Table of contents

- [Commands & usage (quick reference)](COMMANDS.md)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Local setup](#local-setup)
- [Starting MongoDB](#starting-mongodb)
- [Stopping MongoDB](#stopping-mongodb)
- [Viewing logs](#viewing-logs)
- [Connecting with MongoDB Compass](#connecting-with-mongodb-compass)
- [Connecting from applications](#connecting-from-applications)
- [Backup procedure](#backup-procedure)
- [Restore procedure](#restore-procedure)
- [Creating new databases](#creating-new-databases)
- [Creating new users](#creating-new-users)
- [Updating MongoDB](#updating-mongodb)
- [Troubleshooting](#troubleshooting)
- [Deployment to Ubuntu VPS](#deployment-to-ubuntu-vps)
- [Security best practices](#security-best-practices)
- [Project structure](#project-structure)
- [Future expansion](#future-expansion)

---

## Prerequisites

### macOS (development)

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (includes Docker Compose)
- Git
- Optional: [MongoDB Compass](https://www.mongodb.com/products/tools/compass)

### Ubuntu VPS (production)

- Ubuntu 22.04 LTS or newer (recommended)
- Docker Engine + Docker Compose plugin
- Git
- A non-root user with `sudo` and membership in the `docker` group

Install Docker on Ubuntu:

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo \"$VERSION_CODENAME\") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker "$USER"
# Log out and back in for the group change to apply
```

---

## Installation

```bash
git clone <YOUR_REPO_URL> mongodb-server
cd mongodb-server
cp .env.example .env
```

Edit `.env` and replace every `CHANGE_ME_*` value with a strong secret:

```bash
openssl rand -hex 32
```

Run that command once per password field (root + each app user).

> **Important:** `init/init.js` refuses to start if any password still begins with `CHANGE_ME`. This prevents accidental weak defaults on first boot.
>
> **Compose env precedence:** Variables already exported in your shell override values in `.env`. If authentication fails after regenerating `.env`, run `unset MONGO_ROOT_PASSWORD` (and related vars) or open a fresh terminal, then recreate the stack.
---

## Local setup

1. Ensure Docker Desktop is running.
2. Configure `.env` (see above). Keep `MONGO_HOST_BIND=127.0.0.1` unless you intentionally need LAN access.
3. Start the stack (next section).
4. On **first start only**, MongoDB:
   - Creates the root admin user
   - Runs `init/init.js`
   - Provisions `opms`, `crm`, `website`, `inventory`, `analytics`, and `powerapp` databases and users

Data is stored in `./data` (bind mount). Backups go to `./backups`.

> First-boot init runs **only when `./data` is empty**. Changing passwords in `.env` later does **not** update existing users — use `scripts/create-user.sh` or Compass/`mongosh` for password rotations.

---

## Starting MongoDB

```bash
docker compose up -d
```

Check status:

```bash
docker compose ps
docker compose exec mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'db.adminCommand({ ping: 1 })'
```

Or load env vars first:

```bash
set -a && source .env && set +a
docker compose exec mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin \
  --eval 'db.adminCommand({ ping: 1 })'
```

---

## Stopping MongoDB

Graceful stop (keeps data):

```bash
docker compose stop
```

Stop and remove containers (data in `./data` is preserved):

```bash
docker compose down
```

> Do **not** delete `./data` unless you intend to wipe the database and re-run first-boot initialization.

---

## Viewing logs

Follow logs:

```bash
docker compose logs -f mongodb
```

Last 200 lines:

```bash
docker compose logs --tail=200 mongodb
```

---

## Connecting with MongoDB Compass

1. Open MongoDB Compass.
2. Use a connection string (replace password):

```text
mongodb://admin:<ROOT_PASSWORD>@127.0.0.1:27017/?authSource=admin
```

For an application database (preferred for day-to-day inspection of app data):

```text
mongodb://opms_user:<OPMS_PASSWORD>@127.0.0.1:27017/opms?authSource=opms
```

3. Confirm `MONGO_HOST_BIND` allows your client (default `127.0.0.1` is correct for local Compass).

---

## Connecting from applications

### Rules

- Each app uses **its own** username/password/database.
- Set `authSource` to that app’s database.
- Prefer Docker network hostname `mongodb` when the app runs in a container on `mongo-net`.
- Prefer `127.0.0.1` when the app runs on the same host and MongoDB publishes `127.0.0.1:27017`.

### Connection string templates

**Host / local process (macOS or VPS localhost):**

```text
mongodb://opms_user:<PASSWORD>@127.0.0.1:27017/opms?authSource=opms
mongodb://crm_user:<PASSWORD>@127.0.0.1:27017/crm?authSource=crm
mongodb://website_user:<PASSWORD>@127.0.0.1:27017/website?authSource=website
mongodb://inventory_user:<PASSWORD>@127.0.0.1:27017/inventory?authSource=inventory
mongodb://analytics_user:<PASSWORD>@127.0.0.1:27017/analytics?authSource=analytics
mongodb://powerapp_user:<PASSWORD>@127.0.0.1:27017/powerapp?authSource=powerapp
```

**Container on the same Docker network (`mongo-net`):**

```text
mongodb://opms_user:<PASSWORD>@mongodb:27017/opms?authSource=opms
```

Attach another Compose project to this network:

```yaml
# in the application docker-compose.yml
services:
  opms-api:
    networks:
      - mongo-net

networks:
  mongo-net:
    external: true
    name: mongo-net
```

### Example environment variables for an app

```env
MONGODB_URI=mongodb://opms_user:***@mongodb:27017/opms?authSource=opms
# or
MONGODB_URI=mongodb://opms_user:***@127.0.0.1:27017/opms?authSource=opms
```

Never commit real URIs with passwords. Keep them in each application’s private `.env`.

---

## Backup procedure

Full logical backup of all databases:

```bash
./scripts/backup.sh
```

Optional label:

```bash
./scripts/backup.sh --name pre-upgrade
```

Artifacts are written to:

```text
backups/mongodb_full_<UTC-TIMESTAMP>[_label].archive.gz
```

Retention defaults to `BACKUP_RETENTION_DAYS=30`. Daily backups are handled automatically by the `mongo-backup` Compose service (02:00 UTC by default).

### Cron example (Ubuntu VPS)

```bash
crontab -e
```

```cron
0 2 * * * cd /opt/mongodb-server && /usr/bin/docker compose ps --status running --services | grep -qx mongodb && ./scripts/backup.sh >> /var/log/mongodb-backup.log 2>&1
```

---

## Restore procedure

1. Prefer taking a fresh backup first.
2. Restore from an archive:

```bash
./scripts/restore.sh backups/mongodb_full_YYYYMMDDThhmmssZ.archive.gz
```

3. Confirm by typing `restore` when prompted (or pass `--yes` for automation).

The restore uses `mongorestore --drop` and may overwrite existing collections.

---

## Creating new databases

After first boot, `init/init.js` will not run again. Use the helper script:

```bash
./scripts/create-user.sh reporting reporting_user "$(openssl rand -base64 32)"
```

This creates:

- Database `reporting`
- User `reporting_user` with `readWrite` on `reporting` only

Document the new variables in `.env` / `.env.example` for operators.

---

## Creating new users

Same script as above. If the user already exists, the script **updates** the password and roles to `readWrite` on the given database.

Manual alternative (`mongosh` as root):

```bash
set -a && source .env && set +a
docker compose exec -it mongodb mongosh \
  -u "$MONGO_ROOT_USERNAME" \
  -p "$MONGO_ROOT_PASSWORD" \
  --authenticationDatabase admin
```

```javascript
use reporting
db.createUser({
  user: "reporting_user",
  pwd: "STRONG_PASSWORD",
  roles: [{ role: "readWrite", db: "reporting" }]
})
```

---

## Updating MongoDB

1. Backup first:

```bash
./scripts/backup.sh --name pre-mongo-upgrade
```

2. Pin/bump the image in `.env`:

```env
MONGO_IMAGE=mongo:8.2
# later, e.g. mongo:8.3 after reading release notes
```

3. Pull and recreate:

```bash
docker compose pull mongodb
docker compose up -d mongodb
```

4. Verify:

```bash
docker compose logs --tail=100 mongodb
docker compose exec mongodb mongosh -u "$MONGO_ROOT_USERNAME" -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --eval 'db.version()'
```

Always read MongoDB release notes before major version upgrades (e.g. 7 → 8). Prefer minor bumps within the same major when possible.

---

## Troubleshooting

### Container exits immediately

```bash
docker compose logs mongodb
```

Common causes:

- Placeholder `CHANGE_ME` passwords rejected by `init/init.js`
- Corrupt or permission issues under `./data`
- Invalid `config/mongod.conf`

### Init script did not create app users

Init runs **only on empty data directory**. To re-initialize (destructive):

```bash
docker compose down
# DESTROYS ALL DATA
rm -rf data/*
docker compose up -d
```

### Authentication failed from an app

- Confirm username/password/database match `.env`
- Ensure `authSource` equals the application database (not `admin`)
- Confirm you are not using the root user from the app
- Remember: changing `.env` does **not** change passwords already stored in `./data`. Use `create-user.sh` / `updateUser`, or wipe `./data` only if you accept full data loss
- If you recently regenerated `.env` while old `MONGO_*` variables were exported in your shell, Compose may have used the shell values. `unset` them and recreate the container

### Cannot connect from another machine

By default MongoDB is bound to `127.0.0.1` on the host. That is intentional for production.

- Prefer SSH tunnel: `ssh -L 27017:127.0.0.1:27017 user@vps`
- Or place apps on Docker network `mongo-net`
- Do **not** set `MONGO_HOST_BIND=0.0.0.0` on a public VPS without a firewall allowlist and a strong operational reason

### Permission denied on `./data` (Linux)

The official image runs `mongod` as an internal user (often UID `999`). If you created files as root:

```bash
sudo chown -R 999:999 data backups
```

### Port already in use

Change `MONGO_PORT` in `.env` (e.g. `27018`) and restart.

---

## Deployment to Ubuntu VPS

### 1. Prepare the server

- Install Docker (see [Prerequisites](#prerequisites))
- Configure firewall (UFW example):

```bash
sudo ufw allow OpenSSH
sudo ufw enable
# Do NOT publish 27017/tcp to the world
```

### 2. Clone the repository

```bash
sudo mkdir -p /opt/mongodb-server
sudo chown "$USER":"$USER" /opt/mongodb-server
git clone <YOUR_REPO_URL> /opt/mongodb-server
cd /opt/mongodb-server
cp .env.example .env
chmod 600 .env
nano .env   # set strong secrets; keep MONGO_HOST_BIND=127.0.0.1
```

### 3. Start

```bash
docker compose up -d
docker compose ps
./scripts/backup.sh --name initial
```

### 4. Deploy updates via Git

```bash
cd /opt/mongodb-server
./scripts/backup.sh --name pre-pull
git pull
docker compose pull
docker compose up -d
```

`.env`, `data/`, and `backups/` stay on the server and are not committed.

### 5. Connect applications securely

Preferred patterns on a VPS:

1. **Same host, localhost** — apps use `127.0.0.1:27017`
2. **Docker network** — apps join external network `mongo-net` and use host `mongodb`
3. **Remote admin access** — SSH tunnel only; never expose MongoDB publicly

---

## Security best practices

| Practice | How this repo supports it |
|----------|---------------------------|
| Authentication enabled | `MONGO_INITDB_ROOT_*` + official image `--auth` |
| Least privilege | Per-app `readWrite` users only |
| No root in apps | Documented + separate credentials |
| Secrets out of Git | `.env` gitignored; `.env.example` only |
| Not public in production | Default `MONGO_HOST_BIND=127.0.0.1` |
| Docker network isolation | Dedicated `mongo-net` bridge |
| Durable backups | `scripts/backup.sh` + retention |
| Strong passwords | `openssl rand -base64 32`; init rejects `CHANGE_ME` |

Additional recommendations:

- Restrict SSH (keys only, disable password auth)
- Keep Docker and the host patched
- Encrypt VPS disks when the provider supports it
- Store off-site copies of `backups/` (S3, another VPS, etc.)
- Rotate app passwords periodically with `create-user.sh`
- Consider TLS termination via Nginx or MongoDB native TLS for multi-host setups (future enhancement)

---

## Project structure

```text
mongodb-server/
├── docker-compose.yml      # MongoDB service + mongo-net (expansion-ready)
├── .env.example            # Documented environment template
├── .gitignore              # Secrets, data, backups, logs excluded
├── README.md               # Full documentation
├── COMMANDS.md             # Commands & usage quick reference
├── config/
│   └── mongod.conf         # Production-oriented mongod settings
├── init/
│   └── init.js             # First-boot DB + user provisioning
├── scripts/
│   ├── backup.sh           # Full gzipped archive dump
│   ├── restore.sh          # Restore from archive
│   └── create-user.sh      # Add DB/user after first boot
├── data/                   # Persistent MongoDB files (bind mount)
└── backups/                # Backup archives (bind mount)
```

---

## Future expansion

This layout is intentionally flat and Compose-centric. Add sibling services on `mongo-net` without restructuring:

| Component   | Suggested path / service      |
|-------------|-------------------------------|
| Redis       | `redis` service + `data/redis` |
| Prometheus  | `monitoring/prometheus/`      |
| Grafana     | `monitoring/grafana/`         |
| Nginx       | `config/nginx/` + `nginx` service |
| Mongo exporter | sidecar on `mongo-net`     |

Skeleton comments for these services are already present in `docker-compose.yml`.

---

## License

Infrastructure configuration for internal use. MongoDB Community Server is subject to the [Server Side Public License (SSPL)](https://www.mongodb.com/licensing/server-side-public-license).
