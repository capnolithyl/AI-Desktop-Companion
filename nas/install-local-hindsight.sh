#!/bin/sh
# Root-only host installer. Never replaces existing containers or volumes.
set -eu
[ "$(id -u)" = 0 ] || { echo "Run with sudo."; exit 1; }
mikan=nas-mikan-1
old=hindsight-test
local=hindsight-local
retrieval=mikan-retrieval
network=mikan-retrieval-private
volume=hindsight-local-384-data
action=install
[ "$#" -eq 0 ] || action="$1"
if [ "$action" = test ]; then
  docker exec -i "$mikan" node --input-type=module - <<'JS'
import {randomUUID} from "node:crypto";
const bank="mikan-local-smoke-"+randomUUID();
const origin="http://hindsight-local:8888";
async function call(path,body,timeout=15000,method="POST"){
  const r=await fetch(origin+"/v1/default/banks/"+bank+path,{method,headers:{"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(timeout)});
  if(!r.ok)throw Error("HTTP "+r.status);
  return r.status===204?null:r.json();
}
let confirmed=false;
try{
  console.log("Retaining a synthetic fact in isolated bank",bank);
  const start=Date.now();
  const retained=await call("/memories",{items:[{content:"A fictional user named Felix enjoys melodic death metal and owns a cat named Pumpkin."}],async:false},120000);
  if(retained?.success!==true)throw Error("Retain not confirmed");
  confirmed=true;
  console.log("Retain seconds:",(Date.now()-start)/1000,"usage:",JSON.stringify(retained.usage??null));
  const then=Date.now();
  const result=await call("/memories/recall",{query:"What music does Felix enjoy?",budget:"low",max_tokens:500},30000);
  if(!result?.results?.some(r=>/melodic death metal/i.test(r.text??"")))throw Error("Expected synthetic music fact missing");
  console.log("Recall seconds:",(Date.now()-then)/1000);
  console.log("Local Hindsight retain/recall smoke PASSED");
}catch(e){console.error("Smoke failed:",e.name,e.message);process.exitCode=1;}
finally{
  if(confirmed){try{await call("",undefined,15000,"DELETE");}catch{console.error("Synthetic bank cleanup failed:",bank);}}
  else console.log("Retain outcome uncertain; no automatic retry or deletion:",bank);
}
JS
  exit
fi
[ "$action" = install ] || { echo "Usage: $0 install [groq|cerebras|nvidia] [model] OR test"; exit 1; }
provider=groq
[ "$#" -lt 2 ] || provider="$2"
case "$provider" in
 groq) model=openai/gpt-oss-120b; adapter=groq; base=https://api.groq.com/openai/v1 ;;
 cerebras) model=gpt-oss-120b; adapter=openai; base=https://api.cerebras.ai/v1 ;;
 nvidia) model=nvidia/nemotron-3-ultra-550b-a55b; adapter=openai; base=https://integrate.api.nvidia.com/v1 ;;
 *) echo "Unsupported LLM provider"; exit 1 ;;
esac
[ "$#" -lt 3 ] || model="$3"
case "$model" in *[!a-zA-Z0-9._:/-]*|'') echo "Invalid model"; exit 1;; esac
for name in "$local" "$retrieval"; do
  if docker inspect "$name" >/dev/null 2>&1; then echo "$name already exists; inspect it instead of replacing it."; exit 1; fi
done
if docker volume inspect "$volume" >/dev/null 2>&1; then
  echo "$volume already exists; inspect it before any reuse."; exit 1
fi
# Reuse the explicitly selected provider's actual saved credential, never print it.
key=$(docker exec "$mikan" node -e '
const fs=require("node:fs"),p=process.argv[1];
const file=require("node:path").join(require("node:path").dirname(process.env.MIKAN_DB_PATH||"/data/mikan-memory.sqlite3"),".mikan-provider-settings.json");
let saved={};try{saved=JSON.parse(fs.readFileSync(file,"utf8"));}catch{}
const k=saved.keys?.[p]||process.env[p.toUpperCase()+"_API_KEY"];
if(typeof k!=="string"||k.length<12||/\s/.test(k))process.exit(1);
process.stdout.write(k);
' "$provider") || { echo "Configure selected provider in Mikan first."; exit 1; }
[ -n "$key" ] || exit 1
image=$(docker inspect "$mikan" --format '{{.Image}}')
himage=$(docker inspect "$old" --format '{{.Image}}')
docker exec "$mikan" test -f /app/nas/local-retrieval.py || { echo "Install the new Preview image first."; exit 1; }
project=$(docker inspect "$mikan" --format '{{index .Config.Labels "com.docker.compose.project"}}')
[ -n "$project" ] && [ "$project" != '<no value>' ] || { echo "Could not identify Mikan Compose project."; exit 1; }
mnetwork="$project"_default
docker network inspect "$mnetwork" >/dev/null
if ! docker inspect "$mikan" --format '{{range $n, $v := .NetworkSettings.Networks}}{{$n}}{{println}}{{end}}' | grep -Fx "$mnetwork" >/dev/null; then
  echo "Mikan is not on expected Compose network."; exit 1
fi
if docker network inspect "$network" >/dev/null 2>&1; then
  [ "$(docker network inspect "$network" --format '{{.Internal}}')" = true ] || { echo "Existing retrieval network is not internal."; exit 1; }
else
  docker network create --internal "$network" >/dev/null
fi
umask 077
envfile=$(mktemp /tmp/mikan-local-hindsight.XXXXXX)
trap 'rm -f "$envfile"' EXIT
trap 'exit 1' HUP INT TERM
cat > "$envfile" <<EOF
HINDSIGHT_API_LLM_PROVIDER=$adapter
HINDSIGHT_API_LLM_BASE_URL=$base
HINDSIGHT_API_LLM_API_KEY=$key
HINDSIGHT_API_LLM_MODEL=$model
HINDSIGHT_API_LLM_MAX_CONCURRENT=1
HINDSIGHT_API_LLM_TIMEOUT=60
HINDSIGHT_API_LLM_MAX_RETRIES=0
HINDSIGHT_API_EMBEDDINGS_PROVIDER=openai
HINDSIGHT_API_EMBEDDINGS_OPENAI_BASE_URL=http://mikan-retrieval:8090/v1
HINDSIGHT_API_EMBEDDINGS_OPENAI_API_KEY=local-only
HINDSIGHT_API_EMBEDDINGS_OPENAI_MODEL=BAAI/bge-small-en-v1.5
HINDSIGHT_API_EMBEDDINGS_OPENAI_DIMENSIONS=384
HINDSIGHT_API_EMBEDDINGS_OPENAI_BATCH_SIZE=16
HINDSIGHT_API_RERANKER_PROVIDER=cohere
HINDSIGHT_API_RERANKER_COHERE_BASE_URL=http://mikan-retrieval:8090/v1/rerank
HINDSIGHT_API_RERANKER_COHERE_API_KEY=local-only
HINDSIGHT_API_RERANKER_COHERE_MODEL=ms-marco-MiniLM-L-12-v2
HINDSIGHT_API_RERANKER_COHERE_TIMEOUT=20
HINDSIGHT_API_RERANKER_MAX_CANDIDATES=48
HINDSIGHT_API_RERANKER_MAX_CANDIDATES_LOW=32
HINDSIGHT_API_RERANKER_MAX_RETRIES=0
EOF
if [ "$provider" = groq ]; then
  printf '%s\n' HINDSIGHT_API_LLM_GROQ_SERVICE_TIER=on_demand HINDSIGHT_API_LLM_REASONING_EFFORT=low >> "$envfile"
fi
unset key
docker run -d --name "$retrieval" --restart unless-stopped --network "$network" \
  --memory=2g --read-only --tmpfs /tmp:size=64m --security-opt no-new-privileges \
  -e OMP_NUM_THREADS=2 -e OPENBLAS_NUM_THREADS=2 \
  --health-cmd 'curl -fsS http://127.0.0.1:8090/health || exit 1' \
  --health-interval 30s --health-timeout 10s --health-start-period 30s \
  --entrypoint /opt/mikan-embeddings/venv/bin/python "$image" /app/nas/local-retrieval.py >/dev/null
for i in $(seq 1 30); do
  if docker exec "$retrieval" curl -fsS http://127.0.0.1:8090/health; then break; fi
  sleep 2
done
docker exec "$retrieval" curl -fsS http://127.0.0.1:8090/health >/dev/null
docker volume create "$volume" >/dev/null
docker create --name "$local" --restart unless-stopped --network "$mnetwork" \
  --memory=3g --shm-size=1g --stop-timeout=75 --env-file "$envfile" \
  -v "$volume:/home/hindsight/.pg0" "$himage" >/dev/null
docker network connect "$network" "$local"
docker start "$local" >/dev/null
rm -f "$envfile"
echo "Local Hindsight started with $provider / $model; old Hindsight unchanged."
echo "No host ports published. New database: $volume."
for i in $(seq 1 36); do
  if docker exec "$mikan" node -e 'fetch("http://hindsight-local:8888/health",{signal:AbortSignal.timeout(3000)}).then(r=>r.json()).then(v=>{if(v.status!=="healthy"||v.database!=="connected")process.exit(1);console.log(JSON.stringify(v));}).catch(()=>process.exit(1))'; then
    echo "Healthy. Run $0 test for isolated retain/recall, then select Local retrieval in settings."
    exit 0
  fi
  sleep 3
done
echo "Local Hindsight did not become healthy. Inspect docker logs hindsight-local (redact secrets). Existing service and data untouched."
exit 1
