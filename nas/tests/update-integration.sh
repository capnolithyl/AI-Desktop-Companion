#!/bin/sh
# Disposable real-container deployment test. No registry/network credentials,
# no NAS mounts, no user data. Run after the packaged CI image is smoke-tested.
set -eu
root="$(mktemp -d)"
root="$(cd "$root" && pwd -P)"
app="$root/nas"
state="$root/state"
mkdir -p "$app/data"
cp nas/compose.yaml nas/compose.registry.yaml "$app/"
chmod 755 "$root" "$app"
sudo chown 1000:1000 "$app/data"
printf '%s\n' MIKAN_REMOTE_KEY=01234567890123456789012345678901 NVIDIA_API_KEY=synthetic-test-key MIKAN_PROVIDER=nvidia >"$app/.env"
# Alter only the test copy: local images stand in for a registry pull,
# isolated temporary paths stand in for the NAS, and shorter polling intervals.
sed -e "s|^ROOT=/volume1/docker/mikan/nas$|ROOT=$app|" \
    -e "s|^STATE=/volume1/docker/mikan-updater$|STATE=$state|" \
    -e 's|^REGISTRY=.*$|REGISTRY=mikan-nas:test-candidate|' \
    -e 's|docker pull "$REGISTRY"|docker image inspect "$REGISTRY"|' \
    -e 's|"$attempts" -lt 24|"$attempts" -lt 8|' \
    -e 's|sleep 5|sleep 1|' \
    nas/update-beholder.sh >"$root/update.sh"
# Avoid touching real deployment paths even if the updater's defaults change.
grep -Fxq "ROOT=$app" "$root/update.sh"
grep -Fxq "STATE=$state" "$root/update.sh"
grep -Fxq 'REGISTRY=mikan-nas:test-candidate' "$root/update.sh"
compose(){ (cd "$app" && docker compose -f compose.yaml -f compose.registry.yaml "$@"); }
cleanup(){
  compose logs --tail=30 mikan || true
  compose down || true
  sudo rm -rf -- "$root"
}
trap cleanup EXIT
# Same executable bits, different image identity to simulate an earlier build.
printf 'FROM mikan-nas:ci\nLABEL test.previous=true\n' | docker build -t mikan-nas:test-old -
docker tag mikan-nas:ci mikan-nas:test-candidate
MIKAN_IMAGE=mikan-nas:test-old compose up -d --no-build --pull never mikan
health(){ curl -fsS --max-time 5 http://127.0.0.1:3847/api/health; }
i=0
until health >/dev/null 2>&1; do
  i=$((i+1)); [ "$i" -lt 30 ]; sleep 1
done
auth="Authorization: Bearer 01234567890123456789012345678901"
curl -fsS -H "$auth" -H 'Content-Type: application/json' -d '{"action":"addFact","args":{"fact":"Updater fixture must survive"}}' http://127.0.0.1:3847/api/library >/dev/null
sudo sh "$root/update.sh" --check
sudo sh "$root/update.sh"
current(){ docker inspect -f '{{.Image}}' "$(compose ps -q mikan)"; }
good="$(docker image inspect -f '{{.Id}}' mikan-nas:ci)"
[ "$(current)" = "$good" ]
health | grep -Fq '"maintenance":false'
curl -fsS -H "$auth" http://127.0.0.1:3847/api/library | grep -Fq 'Updater fixture must survive'
sudo test ! -e "$state/transaction"
sudo test ! -e "$app/data/.mikan-update-maintenance"
# Candidate starts, but cannot pass the compiled-build validation. Keep its
# actual application and health endpoint functional to exercise data rollback.
# Use a root build step to edit the image's manifest, then restore node user.
cat >"$root/bad.Dockerfile" <<'EOF'
FROM mikan-nas:ci
USER root
RUN node -e 'const fs=require("fs");const p="/app/nas/build-info.json";const v=JSON.parse(fs.readFileSync(p));v.commit="invalid";fs.writeFileSync(p,JSON.stringify(v));'
USER node
EOF
docker build -t mikan-nas:test-candidate -f "$root/bad.Dockerfile" "$root"
if sudo sh "$root/update.sh"; then echo "Invalid candidate unexpectedly passed"; exit 1; fi
[ "$(current)" = "$good" ]
health | grep -Fq '"maintenance":false'
curl -fsS -H "$auth" http://127.0.0.1:3847/api/library | grep -Fq 'Updater fixture must survive'
sudo test ! -e "$state/transaction"
sudo test -f "$state/failed-image"
# A known-bad candidate should not repeatedly interrupt the live service.
sudo sh "$root/update.sh"
[ "$(current)" = "$good" ]
echo "Deployment, consistent snapshot, rollback and failed-image suppression passed."
