#!/bin/sh
# Host-only scheduled updater. Never mount the Docker socket inside Mikan.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
ROOT=/volume1/docker/mikan/nas
STATE=/volume1/docker/mikan-updater
REGISTRY=ghcr.io/capnolithyl/mikan-nas:experimental
MANAGED=mikan-nas:managed
PREVIOUS=mikan-nas:rollback
DATA="$ROOT/data"
MARK="$DATA/.mikan-update-maintenance"
LOCK="$STATE/lock"
JOURNAL="$STATE/transaction"
LOG="$STATE/update.log"
# This root-owned script is intentionally not self-updating.
[ "$(id -u)" = 0 ] || { echo "Run as root via DSM Task Scheduler."; exit 1; }
mkdir -p "$STATE/backups"
chmod 700 "$STATE" "$STATE/backups"
cd "$ROOT"
command -v docker >/dev/null
command -v curl >/dev/null
[ -f compose.yaml ] && [ -f compose.registry.yaml ] && [ -f .env ] && [ -d "$DATA" ] || { echo "Missing NAS deployment/configuration"; exit 1; }
case "${1:-}" in
  ""|--check|--retry) ;;
  *) echo "Usage: update-beholder.sh [--check|--retry]"; exit 2 ;;
esac
mode="${1:-}"
# mkdir works on DSM without depending on flock.
if ! mkdir "$LOCK" 2>/dev/null; then echo "Update already running or stale lock; inspect $LOCK"; exit 0; fi
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
log(){ printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" | tee -a "$LOG"; }
compose(){ docker compose -f compose.yaml -f compose.registry.yaml "$@"; }
current(){ compose ps -q mikan; }
health(){ curl -fsS --max-time 5 http://127.0.0.1:3847/api/health; }
has(){ printf '%s' "$1" | grep -Fq "$2"; }
# Verify an exact image ID, its compiled revision/fingerprint and the actual
# mounted database. Credentials are read only inside the running container.
verify(){
  expected="$1"; expected_revision="$2"; attempts=0
  while [ "$attempts" -lt 24 ]; do
    cid="$(current 2>/dev/null || true)"
    if [ -n "$cid" ] && [ "$(docker inspect -f '{{.Image}}' "$cid" 2>/dev/null || true)" = "$expected" ] && health >/dev/null 2>&1; then
      if docker exec -e "MIKAN_EXPECTED_REVISION=$expected_revision" "$cid" node --input-type=module -e '
        import {DatabaseSync} from "node:sqlite";
        const base="http://127.0.0.1:3847";
        const h=await (await fetch(base+"/api/health")).json();
        if(!h.ok||h.maintenance!==true)process.exit(2);
        const r=await fetch(base+"/api/status",{headers:{Authorization:"Bearer "+process.env.MIKAN_REMOTE_KEY}});
        if(!r.ok)process.exit(3);
        const b=(await r.json()).build;
        if(!b||!b.commit||b.commit==="unknown"||b.backendHash!==b.actualBackendHash||(process.env.MIKAN_EXPECTED_REVISION&&b.commit!==process.env.MIKAN_EXPECTED_REVISION))process.exit(4);
        const w=await fetch(base+"/workspace/");if(!w.ok||!(await w.text()).includes("Mikan"))process.exit(5);
        const db=new DatabaseSync(process.env.MIKAN_DB_PATH||"/data/mikan-memory.sqlite3",{readOnly:true});
        const rows=db.prepare("PRAGMA quick_check").all();
        db.close();if(rows.length!==1||Object.values(rows[0])[0]!=="ok")process.exit(6);
      ' >/dev/null 2>&1; then return 0; fi
    fi
    attempts=$((attempts+1)); sleep 5
  done
  return 1
}
# An interrupted deployment is deliberately fail-closed. Never guess whether
# to overwrite an existing database after a host reboot or partial restore.
if [ -e "$JOURNAL" ] || [ -e "$MARK" ]; then
  log "Interrupted update/maintenance detected; manual recovery required. Preserve $JOURNAL and backups."
  exit 1
fi
cid="$(current)"
[ -n "$cid" ] || { log "Mikan must be running for an automatic update."; exit 1; }
# Verify the actual bind mount, not a guessed env-file value.
mount="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/data"}}{{.Source}}{{end}}{{end}}' "$cid")"
[ "$mount" = "$DATA" ] || { log "Unexpected data mount ($mount); refusing update."; exit 1; }
old="$(docker inspect -f '{{.Image}}' "$cid")"
if ! docker pull "$REGISTRY" >>"$LOG" 2>&1; then log "Registry pull failed; current Mikan unchanged."; exit 1; fi
candidate="$(docker image inspect -f '{{.Id}}' "$REGISTRY")"
[ "$(docker image inspect -f '{{.Os}}/{{.Architecture}}' "$candidate")" = linux/amd64 ] || { log "Wrong image architecture"; exit 1; }
revision="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$candidate")"
source="$(docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.source"}}' "$candidate")"
[ "$source" = "https://github.com/capnolithyl/AI-Desktop-Companion" ] && [ "${#revision}" -eq 40 ] || { log "Missing trusted build labels"; exit 1; }
if [ "$candidate" = "$old" ]; then
  [ "$mode" != "--check" ] || log "Already current ($revision)."
  exit 0
fi
log "Available build $revision"
[ "$mode" != "--check" ] || exit 0
if [ "$mode" != "--retry" ] && [ -f "$STATE/failed-image" ] && [ "$(cat "$STATE/failed-image")" = "$candidate" ]; then log "Previously failed image; waiting for a newer build or --retry."; exit 0; fi
initial="$(health || true)"
if ! has "$initial" '"maintenance":false'; then log "Current deployment lacks maintenance support. Install the initial maintenance-capable bundle manually."; exit 1; fi
if ! has "$initial" '"idle":true'; then log "Mikan is busy; defer update to next scheduled check."; exit 0; fi
# Close the race with incoming chat and background jobs: writes are blocked
# before the second idle check. Existing requests are allowed to finish.
touch "$MARK"
if ! gated="$(health)" || ! has "$gated" '"maintenance":true' || ! has "$gated" '"idle":true'; then
  rm -f "$MARK"; log "Mikan became busy; deferred."; exit 0
fi
stamp="$(date '+%Y%m%d-%H%M%S')-$$"
backup="$STATE/backups/$stamp"
# Record the recovery plan before stopping the current container.
printf 'old=%s\ncandidate=%s\nbackup=%s\nrevision=%s\n' "$old" "$candidate" "$backup" "$revision" >"$JOURNAL"
retired="$(docker image inspect -f '{{.Id}}' "$PREVIOUS" 2>/dev/null || true)"
docker image tag "$old" "$PREVIOUS"
log "Stopping Mikan and backing up data."
if ! compose stop -t 150 mikan; then log "Stop failed; maintenance retained for manual recovery."; exit 1; fi
if ! cp -a "$DATA" "$backup"; then
  log "Backup failed; original data untouched. Restarting the old image."
  docker image tag "$old" "$MANAGED"
  if MIKAN_IMAGE="$MANAGED" compose up -d --no-build --pull never mikan >>"$LOG" 2>&1 && verify "$old" ""; then
    rm -f "$JOURNAL"; rm -f "$MARK"
  fi
  exit 1
fi
printf 'stage=backup_complete\n' >>"$JOURNAL"
sync
# Snapshot was made while all database writers were stopped.
docker image tag "$candidate" "$MANAGED"
log "Starting candidate in maintenance mode."
if MIKAN_IMAGE="$MANAGED" compose up -d --no-build --pull never mikan >>"$LOG" 2>&1 && verify "$candidate" "$revision"; then
  rm -f "$STATE/failed-image"
  # Journal cleared only after validated startup; release the gate last.
  rm -f "$JOURNAL"
  rm -f "$MARK"
  log "Update successful: $revision"
  if [ -n "$retired" ] && [ "$retired" != "$old" ] && [ "$retired" != "$candidate" ]; then docker image rm "$retired" >>"$LOG" 2>&1 || true; fi
  # Retain five most recent pre-update snapshots; failed data is kept separately.
  # Only our own numeric timestamp directories are eligible for pruning.
  count=0
  for name in $(ls -1t "$STATE/backups"); do
    case "$name" in [0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]-[0-9][0-9][0-9][0-9][0-9][0-9]-[0-9]*) ;; *) continue ;; esac
    [ -d "$STATE/backups/$name" ] || continue
    count=$((count+1))
    if [ "$count" -gt 5 ]; then rm -rf -- "$STATE/backups/$name"; fi
  done
  exit 0
fi
log "Candidate failed health/version/database checks. Rolling back."
printf '%s\n' "$candidate" >"$STATE/failed-image"
# All candidate writes were blocked; restore the pre-migration snapshot.
compose stop -t 150 mikan >>"$LOG" 2>&1 || { log "Could not stop candidate; manual recovery required."; exit 1; }
failed="$STATE/failed-data-$stamp"
mv "$DATA" "$failed"
if ! cp -a "$backup" "$DATA"; then log "Restore failed; preserve $failed and $backup; manual recovery required."; exit 1; fi
touch "$MARK"
docker image tag "$old" "$MANAGED"
if MIKAN_IMAGE="$MANAGED" compose up -d --no-build --pull never mikan >>"$LOG" 2>&1 && verify "$old" ""; then
  rm -f "$JOURNAL"; rm -f "$MARK"
  log "Rollback successful. Failed candidate data preserved at $failed"
  exit 1
fi
log "Rollback verification failed; maintenance remains enabled; inspect $JOURNAL."
exit 1
