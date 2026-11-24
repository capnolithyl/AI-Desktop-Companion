#!/bin/sh
# Root-owned host bridge: fixed check/install/channel requests, never app-provided commands.
set -eu
umask 077
PATH=/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/var/packages/ContainerManager/target/usr/bin:$PATH
export PATH
ROOT=/volume1/docker/mikan/nas
STATE=/volume1/docker/mikan-updater
UPDATER=/root/mikan-updater/update-beholder.sh
REGISTRY=ghcr.io/capnolithyl/mikan-nas:stable
PREVIEW_REGISTRY=ghcr.io/capnolithyl/mikan-nas:preview
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
publish(){ bridge publish "$1" "$(installed || true)" "$(available)" "$channel" >/dev/null 2>&1 || true; }
now="$(date +%s)"
last=0
if [ -f "$STATE/last-auto-check" ]; then last="$(cat "$STATE/last-auto-check")"; fi
case "$last" in ""|*[!0-9]*) last=0;; esac
channel=stable
if [ -f "$STATE/channel" ]; then
  channel="$(cat "$STATE/channel")"
  case "$channel" in stable|preview) ;; *) channel=stable ;; esac
fi
request="$(bridge take 2>/dev/null || true)"
# Selection is root-owned state, outside the application data/rollback snapshot.
# The only permitted channel change is one of these literal queued actions.
case "$request" in
  switch-stable) channel=stable ;;
  switch-preview) channel=preview ;;
esac
case "$request" in
  switch-stable|switch-preview)
    printf '%s\n' "$channel" >"$STATE/channel.tmp"
    mv "$STATE/channel.tmp" "$STATE/channel"
    request=install ;;
esac
[ "$channel" != preview ] || REGISTRY="$PREVIEW_REGISTRY"
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
MIKAN_UPDATE_CHANNEL="$channel" sh "$UPDATER" "$@" >"$output" 2>&1 || code=$?
cat "$output"
case "$code" in
  0)
    if grep -Fq 'Update successful:' "$output"; then phase=updated
    elif grep -Fq 'Previously failed image' "$output"; then phase=failed
    elif grep -Eq 'defer|deferred|Update already running' "$output"; then phase=deferred
    elif [ "$mode" = check ] && grep -Fq 'Available build ' "$output"; then phase=available
    elif [ "$(installed || true)" = "$(available)" ]; then phase=current
    else phase=deferred
    fi ;;
  *) if grep -Fq 'Rollback successful' "$output"; then phase=rolled-back; else phase=failed; fi ;;
esac
publish "$phase"
exit "$code"
