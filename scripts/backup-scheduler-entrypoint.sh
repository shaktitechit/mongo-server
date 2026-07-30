#!/usr/bin/env bash
# =============================================================================
# scripts/backup-scheduler-entrypoint.sh
#
# Long-running entrypoint for the mongo-backup service.
# Runs scheduled-backup.sh once per day at BACKUP_SCHEDULE_HOUR:MINUTE (UTC).
#
# Defaults: 02:00 UTC every day, retention via BACKUP_RETENTION_DAYS (30).
# =============================================================================

set -euo pipefail

HOUR="${BACKUP_SCHEDULE_HOUR:-2}"
MINUTE="${BACKUP_SCHEDULE_MINUTE:-0}"
RUN_ON_STARTUP="${BACKUP_RUN_ON_STARTUP:-false}"

echo "[scheduler] Daily MongoDB backup at $(printf '%02d:%02d' "${HOUR}" "${MINUTE}") UTC"
echo "[scheduler] Retention: ${BACKUP_RETENTION_DAYS:-30} days"

if [[ "${RUN_ON_STARTUP}" == "true" ]]; then
  echo "[scheduler] RUN_ON_STARTUP=true — running an immediate backup"
  /usr/local/bin/scheduled-backup.sh || echo "[scheduler] Startup backup failed (will retry on schedule)" >&2
fi

seconds_until_next_run() {
  local hour="$1" minute="$2"
  local now_h now_m now_s
  now_h="$(date -u +%H)"
  now_m="$(date -u +%M)"
  now_s="$(date -u +%S)"

  # Seconds from midnight UTC to the scheduled time and to now
  local sched_secs=$((10#${hour} * 3600 + 10#${minute} * 60))
  local now_secs=$((10#${now_h} * 3600 + 10#${now_m} * 60 + 10#${now_s}))
  local delta=$((sched_secs - now_secs))

  if (( delta <= 0 )); then
    delta=$((delta + 86400))
  fi

  echo "${delta}"
}

while true; do
  WAIT="$(seconds_until_next_run "${HOUR}" "${MINUTE}")"
  echo "[scheduler] Next backup in ${WAIT}s (target $(printf '%02d:%02d' "${HOUR}" "${MINUTE}") UTC)"
  sleep "${WAIT}"

  echo "[scheduler] Triggering scheduled backup"
  if /usr/local/bin/scheduled-backup.sh; then
    echo "[scheduler] Scheduled backup succeeded"
  else
    echo "[scheduler] Scheduled backup FAILED — will try again tomorrow" >&2
  fi

  # Avoid double-run if the job finishes in the same minute
  sleep 60
done
