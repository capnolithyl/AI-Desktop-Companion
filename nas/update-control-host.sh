#!/bin/sh
# Root-owned host bridge: only two fixed requests, never execute app-provided commands.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
ROOT=/volume1/docker/mikan/nas
STATE=/volume1/docker/mikan-updater
UPDATER=/root/mikan-updater/update-beholder.sh
REGISTRY=ghcr.io/capnolithyl/mikan-nas:experimental
[ "$(id -u)" = 0 ] || exit 1
mkdir -p "$STATE"
chmod 700 "$STATE"
cd "$ROOT"
lock="$STATE/control-lock"
if ! mkdir "$lock" 2>/dev/null; then exit 0; fi
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
current(){ docker compose -f compose.yaml -f compose.registry.yaml ps -q mikan; }
bridge(){
  cid="$(current)"
  [ -n "$cid" ] || return 1
  # Always run as the unprivileged application user, even though the host is root.
  docker exec -u 1000:1000 "$cid" node /app/nas/update-control.mjs "$@"
}
installed(){
  cid="$(current)"
  [ -n "$cid" ] || return 0
  image="$(docker inspect -f '{{.Image}}' "$cid")"
  docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$image"
}
available(){ docker image inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$REGISTRY" 2>/dev/null || true; }
publish(){ bridge publish "$1" "$(installed || true)" "$(available)" >/dev/null 2>&1 || true; }
now="$(date +%s)"
last=0
if [ -f "$STATE/last-auto-check" ]; then last="$(cat "$STATE/last-auto-check")"; fi
case "$last" in ""|*[!0-9]*) last=0;; esac
request="$(bridge take 2>/dev/null || true)"
# Default automatic deployment cadence stays at five minutes. The one-minute
# host task only wakes to consume explicit requests between those checks.
case "$request" in
  check) mode=check ;;
  install) mode=install ;;
  *) if [ "$((now-last))" -lt 300 ]; then exit 0; fi; mode=install ;;
esac
[ "$mode" != install ] || printf '%s\n' "$now" >"$STATE/last-auto-check"
case "$mode" in
  check) publish checking; set -- --check ;;
  install) publish installing; set -- ;;
esac
# Capture only the existing root-owned updater's output. Do not send raw logs,
# credentials, host paths, or arbitrary errors to the web application.
output="$STATE/control-last-run.log"
code=0
sh "$UPDATER" "$@" >"$output" 2>&1 || code=$?
cat "$output"
case "$code" in
  0)
    if grep -Fq 'Update successful:' "$output"; then phase=updated
    elif grep -Fq 'Previously failed image' "$output"; then phase=failed
    elif grep -Eq 'defer|deferred|Update already running' "$output"; then phase=deferred
    elif [ "$(installed || true)" = "$(available)" ]; then phase=current
    elif [ "$mode" = check ] && grep -Fq 'Available build ' "$output"; then phase=available
    else phase=deferred
    fi ;;
  *) if grep -Fq 'Rollback successful' "$output"; then phase=rolled-back; else phase=failed; fi ;;
esac
publish "$phase"
exit "$code"
