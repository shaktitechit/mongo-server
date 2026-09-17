# MongoDB Server Utility Scripts

This directory contains shell scripts for managing user authentication, performing database backups, and restoring database state. These scripts simplify common administrative operations by interacting directly with the MongoDB Docker container.

---

## Script Directory Structure

| Script File | Purpose | Execution Context | Run Frequency |
| :--- | :--- | :--- | :--- |
| [`create-user.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/create-user.sh) | Provision a new database and scoped application user | Host machine | On-demand |
| [`backup.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/backup.sh) | Run a full database backup | Host machine | On-demand (manual) |
| [`restore.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/restore.sh) | Restore database from an archive | Host machine | On-demand |
| [`scheduled-backup.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/scheduled-backup.sh) | Executed internally to generate a dump file | Inside `mongo-backup` container | Automatically daily |
| [`backup-scheduler-entrypoint.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/backup-scheduler-entrypoint.sh) | Scheduler loop timing manager | Inside `mongo-backup` container | Daemon process |

---

## Prerequisites

Before running any script on your host machine:
1. Ensure the docker-compose services are running (`docker compose up -d`).
2. Make sure you have a valid `.env` file in the root of the project containing `MONGO_ROOT_USERNAME` and `MONGO_ROOT_PASSWORD`.
3. Give execution permissions if not already set:
   ```bash
   chmod +x scripts/*.sh
   ```

---

## 1. Creating Database Users

Use [`create-user.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/create-user.sh) to provision a new database along with a dedicated user who has scoped `readWrite` permissions on that database.

> [!NOTE]
> Run this *after* the initial server setup. The application user is created with scoped privileges (no access to the `admin` database or other application databases).

### Usage
```bash
./scripts/create-user.sh <database_name> <username> <password>
```

### Example
```bash
./scripts/create-user.sh reporting reporting_user 'YOUR_SECURE_PASSWORD_HERE'
```

### How it Works
1. Validates the existence of the root `.env` file.
2. Checks that the `mongodb` service container is running.
3. Invokes `mongosh` within the container, connecting with root credentials.
4. If the user already exists, updates the password and roles. Otherwise, creates the user and creates an `_init` collection to establish the database.

---

## 2. On-Demand Full Backups

Use [`backup.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/backup.sh) to capture a compressed point-in-time backup archive of all databases.

### Usage
```bash
./scripts/backup.sh [options]
```

### Options
* `--name <custom_label>`: Appends a custom text label to the backup file name.
* `-h`, `--help`: Displays quick script usage info.

### Examples
```bash
# Standard backup
./scripts/backup.sh

# Labeled backup before a major upgrade
./scripts/backup.sh --name pre-upgrade
```

### Outputs
Backups are saved as compressed files to the `./backups/` folder under the project root:
* Name structure: `mongodb_full_YYYYMMDDThhmmssZ[_label].archive.gz`
* *Example*: `mongodb_full_20260824T100520Z_pre-upgrade.archive.gz`

### Retention and Pruning
The script will automatically delete archives older than the duration specified by `BACKUP_RETENTION_DAYS` in your `.env` file (defaults to `30` days).

---

## 3. Restoring Backups

Use [`restore.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/restore.sh) to restore database content from an archive created by the backup scripts.

> [!WARNING]
> This command uses the `--drop` flag when calling `mongorestore`, which will delete existing tables in the active database before restoring. Ensure you have backed up any current data before proceeding.

### Usage
```bash
./scripts/restore.sh <path_to_backup_archive> [options]
```

### Options
* `-y`, `--yes`: Skips the interactive confirmation prompt.
* `-h`, `--help`: Displays quick script usage info.

### Examples
```bash
# Restore with confirmation prompt
./scripts/restore.sh backups/mongodb_full_20260824T100520Z_pre-upgrade.archive.gz

# Restore immediately (useful in scripts or CI)
./scripts/restore.sh backups/mongodb_full_20260824T100520Z_pre-upgrade.archive.gz --yes
```

### Path Constraints
* The target archive file **must** reside in the `./backups` directory of the project, as this directory is shared/mounted to the container as `/backups`.

---

## 4. Scheduled Backups

The scheduler uses two scripts inside the `mongo-backup` service (configured in `docker-compose.yml`):

### A. [`scheduled-backup.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/scheduled-backup.sh)
This script is executed within the container's environment. It connects directly to the container hostname `mongodb` using root credentials, generates a compressed dump file via `mongodump`, saves it to `/backups`, and prunes old archives according to `BACKUP_RETENTION_DAYS`.

### B. [`backup-scheduler-entrypoint.sh`](file:///Users/macbook/Desktop/mongo-server/scripts/backup-scheduler-entrypoint.sh)
The entrypoint daemon for the `mongo-backup` container. It calculates the time remaining until the next scheduled backup and sleeps until that time.
* **Frequency**: Runs once every 24 hours.
* **Default execution time**: `02:00 UTC`.
* **Configurable variables** (via `.env`):
  * `BACKUP_SCHEDULE_HOUR` (default: `2`)
  * `BACKUP_SCHEDULE_MINUTE` (default: `0`)
  * `BACKUP_RUN_ON_STARTUP` (default: `false` - set to `true` to force a backup run immediately upon service startup)
  * `BACKUP_RETENTION_DAYS` (default: `30`)
