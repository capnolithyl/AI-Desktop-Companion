# Mikan on Beholder

**Current status (2026-11-24):** NAS migration merged into main. Managed Beholder deployments use the tested registry image; the existing experimental tag remains the compatibility update channel, now published only from main. Do not copy an old source bundle over a managed installation.

Working standalone NAS features: private remote browser access, cloud provider selection, persistent SQLite chat, shared React workspace/Iki, persona and outfit settings, structured memory library, optional memory learning, SearXNG, read-only Notion and cached webpage library, Brain Lab diagnostics, and guarded automatic updates. Research quality is an ongoing separate project.

Remaining parity work: desktop and Android native clients using the central NAS API, local PC inference/advanced semantic memory (Mem0/Qdrant/Ollama), voice, screen capture/vision, full custom rig/runtime settings and additional integrations. Keep the original Windows data and app; this is not a bidirectional database sync. NAS remains cloud-inference-only.

The initial prototype setup below is historical. Existing installations should use the managed updater, not reinstall.

## 1. Gather the files on Windows

Use **main**. For a fresh development checkout:

```powershell
git fetch origin main
git worktree add ..\AI-Desktop-Companion-NAS origin/main
```

Make the following small folder layout on Beholder's file share, e.g. `\\BEHOLDER\docker\mikan-src`:

```
mikan-src/
  nas/                          # copy the whole nas/ directory from PR branch
    Dockerfile
    compose.yaml
    .env.example
    server.mjs
    storage.mjs
    providers.mjs
    public/
    tests/
    data/                       # persistent NAS storage; initially empty
  assets/
    iki/
      mikan-chat-avatar.webp    # from the same branch's assets/iki/
  .dockerignore                 # optional, reduces Docker build context
```

Copying only these paths is sufficient for a NAS Docker build; the entire art-heavy Git repo is **not** required. Synology File Station or a Windows SMB share both work. Keep `nas/data/` outside version control and in regular NAS backups.

## 2. Configure the secrets

SSH into Beholder (DSM Control Panel → Terminal & SNMP → Enable SSH temporarily). Navigate to your shared folder, such as `/volume1/docker/mikan-src/nas` (adjust for your volume/share). Create `.env` from the example:

```sh
cd /volume1/docker/mikan-src/nas
cp .env.example .env
openssl rand -hex 32
```

Paste the generated 64-character token as `MIKAN_REMOTE_KEY` in `.env`. Put your **existing** NVIDIA API key in `NVIDIA_API_KEY`. For NVIDIA, start with `MIKAN_PROVIDER=nvidia` and choose a model your key actually supports; the example model is a **candidate**, not a guarantee of current entitlement or availability. You can instead set `MIKAN_PROVIDER=openrouter` with `MIKAN_MODEL=openrouter/free` plus `OPENROUTER_API_KEY`, or use Gemini with `GEMINI_API_KEY` and an available Gemini model.

Only one provider is used at a time. All provider keys stay in the server environment. No API key is placed in the browser. Do not commit `.env` or expose it in screenshots.

Optional persona: create `nas/data/persona.txt` containing Mikan's desktop system prompt. Without it, the service uses a small built-in Mikan personality, **not** all of the desktop personality settings. This is a good early way to preserve her voice.

## 3. Optional: bring the existing SQLite chat/facts

**Make a backup before doing this.** Locate `mikan-memory.sqlite3` in the Windows Mikan application data directory. Do not guess the exact folder. Either use SQLite's online `.backup` command while the app is running, or fully quit Mikan and its background processes before copying. If raw-copying a stopped database, ensure any pending `-wal` files have been checkpointed, or copy the matching WAL files too. Never copy only a live main DB while Windows is writing to it.

Copy the consistent backup to `nas/data/mikan-memory.sqlite3` **before the first NAS startup**, and retain the original Windows database. The NAS app uses compatible `conversations`, `messages`, `user_memories`, `character_facts` and `interest_items` tables without removing other data. It does **not** migrate Qdrant embeddings, advanced memory, or desktop settings. It does **not** sync subsequent changes made on Windows.

Do not point the Windows app at the NAS SQLite file over SMB and do not have two applications independently writing the same database. We need a central API and one authoritative write path before true cross-device synchronization.

## 4. Launch Docker

Install Synology's **Container Manager** (DSM 7.2+) or the older Docker package as appropriate for the DS916+. The package and Compose command depend on the installed DSM version; check them before starting. From SSH:

```sh
cd /volume1/docker/mikan-src/nas
mkdir -p data
sudo chown -R 1000:1000 data
docker compose up -d --build
docker compose ps
docker compose logs --tail=50 mikan
curl http://127.0.0.1:3847/api/health
```

If your older DSM has `docker-compose` rather than `docker compose`, use that form instead. If `docker` requires elevation, use `sudo docker compose ...`. The UID/GID command gives the unprivileged container user (1000) permission to write SQLite files. Adjust if your Synology folder permissions/ACLs require a different approach.

Expected local health response: `{"ok":true,"service":"mikan-nas"}`. The Docker port is bound to **127.0.0.1 on Beholder**, not to the LAN or public internet. The service will refuse to start until the selected provider key and a long access key are configured.

This setup aims for well under 1 GB of memory under normal usage (the Compose service is capped at 512 MB), but actual performance on the DS916+ remains unmeasured.

## 5. Private phone access with Tailscale

Install/enable Tailscale **on Beholder itself**, join the same tailnet as your phone, then use its SSH CLI to proxy the local service:

```sh
sudo tailscale serve --bg http://127.0.0.1:3847
sudo tailscale serve status
```

If the Synology package does not put `tailscale` on PATH, look for it at `/var/packages/Tailscale/target/bin/tailscale`. Confirm your installed Tailscale version supports the current Serve syntax; do not enable Funnel for this experiment. If prompted, enable tailnet HTTPS.

With Tailscale active on your phone, open the **HTTPS address shown by `tailscale serve status`**, and enter `MIKAN_REMOTE_KEY` in Mikan's login panel. The access key lasts only for the browser tab/session. Hostinger and all your existing subdomains stay untouched.

If Serve is unavailable on the installed Synology package, stop here and verify NAS/Tailscale support rather than exposing TCP port 3847 publicly. You can still test the application from the NAS using the local health endpoint.

## Updating and backing up

From the NAS folder, after copying fresh `nas/` files from a newer approved PR commit:

```sh
docker compose up -d --build
docker compose logs --tail=50 mikan
```

Back up `nas/data/` through your usual NAS backup process. For a consistent SQLite backup while the container is live, use a SQLite online backup tool or stop the container first. Be aware that cloud inference sends relevant chat messages and retrieved memories to the **selected external LLM provider**. They are stored locally but aren't private from the model provider.

## Quick diagnostics

- **No response / error:** check `docker compose logs --tail=80 mikan`, model name, provider quota, and API credentials. Provider failures are deliberately not printed verbatim in the browser.
- **Permission denied opening SQLite:** confirm the data folder is writable by container UID 1000; check DSM ACLs.
- **Browser inaccessible:** verify Tailscale on both devices and `tailscale serve status`; the NAS container intentionally has no LAN-facing port.
- **Old memory not found:** import a consistent SQLite snapshot. Only matching lexical memories are recalled for now; Qdrant is not connected.
- **Before merging:** review security boundary, complete real provider smoke tests, and check Docker build and memory consumption on the actual NAS.

Design principle: Beholder is the independent backend; keep unfinished client integrations separate from the completed hosting milestone.

## Shared React workspace update (phase 1)

The web build now uses the real desktop workspace, CSS, artwork, personality controls, Markdown and Iki renderer. The old preview remains available at `/legacy`. The NAS profile (persona, communication, sliders and bundled avatar settings) persists in the existing SQLite database, not in browser localStorage. The desktop export button is under Personality; export a profile and import it in the NAS Control Center. It does not contain provider keys or memory data. Custom imported rigs and the full desktop settings/runtime are not yet portable.

Build on Windows in the NAS worktree using `npm ci` then `npm run build:nas`. Copy the **contents** of `.nas-deploy` to your existing NAS `docker/mikan` folder using ordinary overwrite/copy (never mirror/delete). The bundle contains neither `.env` nor `data`, so keep the existing ones. Before updating, stop the container and back up the whole data directory. Then run `sudo docker compose up -d --build` from `/volume1/docker/mikan/nas`. No Tailscale changes. Visit the existing URL and hard refresh. The default workspace is the first UI mode ported; Minimal and other control-center pages remain future work.

Do not copy the entire git repo or use `robocopy /MIR` over the live NAS data. If the new UI fails, `/legacy` still works using the same database and profile.

The NAS smoke-test workflow also publishes `mikan-nas-deployment` as a ZIP artifact after the build and packaged-container checks pass. You can extract that instead of running the Windows build yourself. Copy its contents into the existing NAS deployment root without replacing `.env` or `nas/data/`.

### Structured memory library
The NAS now exposes authenticated owner facts, labels, pins, character canon, interests, conversation deletion and existing session notes using desktop-compatible tables. Imports append without overwriting duplicates, and conversions are transactional. Existing FTS archive searches retrieve bounded historical user quotations only. Automatic extraction, review queue, semantic embeddings and destructive bulk replacement are not available in this phase. The deployment bundle includes the shared validators and retrieval modules.

### Automatic learning (opt-in)
Independent NAS switches enable user and character capture. A persisted NAS-only queue makes a separate cloud inference request after each privacy-eligible completed turn, at most one per 15-second tick, serialized with chat. The model receives bounded recent context and relevant existing facts, interests and canon, then decides save, review or skip. No keyword-based semantic prefilter or deterministic preference parser. Code validates exact source evidence, permissions, data types, known target IDs, duplicate keys and approval for replacements. This increases extraction request volume when enabled; quota and latency need live testing. Evidence is a verbatim source quote. Failed jobs require explicit retry. Existing desktop extraction queues are not executed on the NAS. No credentials are stored in jobs. Conservative port, not full desktop extraction parity.

### Deployment identity and memory notifications
The sidebar below the peek cat displays the compiled browser version and Git revision. Click to copy both browser and running backend identities, including a hash of actual backend service files. Use a full build/deployment for matching fingerprints. Authenticated event polling delivers committed memory saves, pending reviews and extraction failure stages to the shared toast style; no-op decisions produce no success toast. Conversation debug copies include recent extraction events. No raw provider errors, keys or raw model responses are exposed.

### Conversation activity
The shared right sidebar reads authenticated per-conversation NAS memory events. Actual supplied recall context, committed saves, suggestions, pending checks, no-op results and failures are shown. Previously recorded extraction outcomes are recovered idempotently if no corresponding event exists. The notification cursor is initialized before chat is enabled, independent of historical activity. Web search events will be connected when NAS research is implemented.

## Automatic Beholder updates (experimental channel)
GitHub Actions publishes the exact smoke-tested Linux amd64 image to `ghcr.io/capnolithyl/mikan-nas:experimental` and an immutable-by-convention `sha-<commit>` tag, only on pushes to main. The registry package is not made public by this workflow. Use a classic PAT with read:packages for private pulls, and do not paste it into chat. The repository workflow uses GITHUB_TOKEN only.

One last normal full deployment is required to install maintenance support and compose.registry.yaml. Preserve .env and data. Copy update-beholder.sh to a root-owned directory outside the application, e.g. /root/mikan-updater/update-beholder.sh; chmod 700. Authenticate Docker as root with docker login ghcr.io -u capnolithyl (enter PAT at password prompt). Run the script --check first, then once without arguments and confirm health. Schedule it in DSM Task Scheduler as root every 5 minutes. It pulls a tested image, defers while chat/extraction/writes are active, sets a write gate, stops the container, snapshots data, starts the candidate under maintenance, verifies image identity/build fingerprint/workspace and SQLite quick_check, then releases the gate. On failed validation it stops candidate, preserves failed data separately, restores snapshot and previous local image, verifies rollback. Retains five snapshots; failed data is kept for inspection. Does not update itself or change Tailscale. Logs and recovery journal are in /volume1/docker/mikan-updater. Current data mount must be /volume1/docker/mikan/nas/data. Do not use docker compose up --build once managed, unless intentionally reverting to manual deployment.

If interrupted, the updater fails closed when a lock, transaction journal or maintenance flag remains. Inspect the journal and actual running container before any manual restoration; do not simply delete the maintenance marker if a migration or backup was interrupted. Use the logged backup and previous image, or restore manually after stopping all writers. No automated recovery is attempted after power loss. Health checks cannot prove all features or live provider availability. Reload the browser after updates to load new assets.

The browser checks the authenticated server build every 30 seconds and on tab visibility changes. A mismatch offers a reload button rather than reloading over unsaved text. A maintenance HTTP 503 preserves the rejected chat draft. For a private registry, authenticate root's Docker client once; the application never receives the registry token. Set the DSM scheduled task to notify on abnormal termination if you want an alert for failed rollbacks or registry failures.

CI also exercises the host updater against disposable local containers and synthetic SQLite data, including a deliberately invalid build manifest, successful rollback and suppression of repeated failed updates. This does not replace a first-run check on the Synology itself.

### Manual update controls (optional host bridge)
The Software Updates page arrives in the normal registry image. Existing scheduled automatic updates remain unchanged until the host bridge is installed. Once the new image is running, copy its reviewed host bridge to the root-owned updater folder using `sudo docker cp nas-mikan-1:/app/nas/update-control-host.sh /root/mikan-updater/update-control-host.sh` and `sudo chmod 700 /root/mikan-updater/update-control-host.sh`. Replace the existing DSM scheduled task command with `sh /root/mikan-updater/update-control-host.sh`; use a one-minute repeat interval if supported (otherwise five minutes). Run the task once to connect the status panel. Do not run both scheduled tasks. The bridge keeps automatic deployment checks at five minutes; manual requests are picked up on the next task run. It accepts only fixed check/install requests via the unprivileged container and calls the original root-owned updater. No Docker socket or host shell is exposed to the app. Status and bounded update history are persisted in the data directory. This is not a self-updating host script; future host changes require explicit installation.

The real-container deployment test also exercises the authenticated request endpoint and host bridge, including a manual check that leaves the running image unchanged followed by an explicit install. Host status is a snapshot of the last scheduler run, not a real-time registry query.

### Current NAS model settings
The managed image supports authenticated Models & providers settings and chat dock switching. Existing .env credentials/model remain defaults; UI key replacements and selections are persisted atomically in a mode-0600 file alongside SQLite, included in private host backups. Keys are write-only and never included in API responses, conversation metadata or debug logs. OpenRouter routes must be free; Gemini project billing/free eligibility is the owner's responsibility. All outbound chat and extraction attempts share persisted conservative NAS limits (NVIDIA 30/min, OpenRouter 15/min and 40/UTC day, Gemini 5/min); other applications using the same key are not counted. No automatic provider fallback or retry. Text-only requests; native tools and image input are not implemented. The history budget is characters, not an exact token window. Actual response model is recorded only when the upstream response supplies it; older conversations retain no invented metadata. No host setup changes for existing managed deployments.

Provider HTTP 429 starts a five-minute persisted provider-specific cooldown across chat and learning; no failed request is automatically retried. Queued learning waits while the local budget is exhausted. All quotas are local conservative safeguards, not a guarantee of provider free-tier availability.

### NAS web research (experimental)
Install a separate SearXNG sidecar using nas/searxng/compose.yaml and settings.yml. Put settings.yml under config/, generate SEARXNG_SECRET in a private .env, and start the sidecar in its own project on the existing nas_default external network. No published port. The managed updater still controls only Mikan. In Control Center > Web research, Test search connection then enable Simple or Strict (off by default). Model-led JSON planning uses recent user messages, not retrieved memory or previous assistant replies, and must generate public-only queries. Simple uses search previews or explicit direct URLs; Strict adds a bounded evidence planning pass and up to three source reads. No semantic regex routing. Actual search/read events and numbered source metadata persist. Page reader pins checked public IPv4 addresses on every redirect; only HTTP(S) default ports and bounded HTML/text, no browser JS or PDFs. HTML extraction is basic. No guarantees of upstream engine access or completeness. Existing Yahoo-only engine config follows desktop baseline; change after real tests. The sidecar requires a one-time setup, not automated through the root updater. UTC time is included in every response prompt. Full desktop strict verification, cache, and Notion are not yet ported.

### NAS timing and Brain Lab
The conversation log and JSON debug export expose server wall-time stages (context, planner calls, SearXNG, webpage reads, answer model), first visible answer text and model call count. They do not isolate network versus reasoning or estimate token counts. Brain Lab uses the shared desktop fixture catalog and raw diagnostic reports with the real NAS executor in a fresh in-memory SQLite store per scenario/repeat. No owner memory, persona, chat, Notion or real memory learning is accessed; only reports and quota accounting are stored on the owner DB. Runs use one configured model at a time, shared provider quotas and conservative desktop cloud pacing; no retries on quota errors. Normal inference and maintenance are blocked during runs. Reports survive browser closure and restarts; interrupted runs are not resumed. Tests relying on unsupported integrations, mocked evidence, prior document context or task-exclusion validation are disabled. Public facts and subjective quality need human review. This is an initial NAS-native Live runner, not full desktop Brain Lab parity (no fast routing, presets, model sweep, capture preview or cross-run score dashboard).

### NAS knowledge library (experimental)
Control Center > Knowledge & Notion: paste the existing internal integration secret (read-only capabilities), select all shared or individual pages, and Sync now. Token is a restricted file beside the database, not DPAPI-encrypted, and included in private host backups. Notion API 2025-09-03 supports paginated page/data source discovery, nested blocks and relations. Sync uses bounded text-only snapshots and atomically replaces desktop-compatible notion_pages/chunks/FTS/relations after successful retrieval; failures retain prior cache. Imported cache is preserved at startup. Select both chapters and linked scene pages or their shared database. No writes to Notion. No automatic Notion sync. Explicit cloud consent is separate and off by default. The local-reference planner receives candidate titles/recent user messages; selected source text goes to the chosen cloud provider only when permitted. This is not local inference. Local reference requests do not run public searches; public queries still use the separate existing model-led web planner. Shared desktop manuscript reader validates approved prose and linked scenes, refuses over-budget complete reads rather than silently truncating. Explicit chapter selection, ordinal matching, load receipts, missing-chapter handling, original prose reading and grounded reply validation reuse the desktop Notion modules. The model planner remains for general cached references. Recent source metadata survives unsuccessful turns. Grounded reviews exclude prior assistant replies and personal memory; one quota-checked corrective generation is allowed on an audit failure. Drafts remain buffered. Missing linked scenes may be read through the existing read-only Notion API; this does not replace the synced library. NVIDIA uses the desktop direct reading profile. The NAS has no local Ollama summarizer, so over-budget chapters still fail explicitly rather than silently invoking a cloud summarizer. The heuristic audit is not semantic verification. The original desktop Notion regression suites run alongside NAS integration tests. Memory recall now uses the desktop deterministic selector and original FTS5 fact index schema; saved session notes are retrieved using the shared context budget. Optional session generation is off by default and requires separate cloud consent in Memory suggestions; the shared desktop evidence-checked merge and bounded SQL watermark prevent fabricated quotes and repeated summarization. The Rust native research validator compiles the original source-record, cloud-evidence, attribution, quantity and recommendation-gate modules in a headless build stage; no additional running service. Strict public research uses an isolated source-evidence tool contract (no persona or unrelated personal context), explicit output-token budgets, safe finish-reason/usage diagnostics and at most one quota-aware repair for malformed or exhausted output. Ordinary chat bypasses unrelated private library candidates; historical session retrieval uses whole-word matching and relevant lines only. Follow-up searches reserve source slots for new evidence. Live provider compatibility remains subject to testing. Native validation does not port the entire desktop native provider/tool orchestration. Qdrant and local Ollama reranking remain optional host-dependent functionality, not silently substituted with cloud calls. NAS chat and Brain Lab also use the shared desktop instruction composer, personal-grounding rules, conversation anchors and America/Detroit runtime clock; host-specific capability text remains explicit. Strict public research buffers its answer for the same deterministic desktop evidence review against the supplied excerpts, with source-headline fallback. Simple mode continues streaming. This does not port the native Rust claim extraction, recommendation constraint verification or full research orchestration. Manuscript turns do not mark excluded personal memories as recalled. Source dates/coverage persist, knowledge-assisted conversations skip automatic personal memory learning while reference sources remain in recent history. Existing chat text and backups are not erased when removing cached pages. Public page cache is capped at 200 excerpts, 24h normal/1h recent refresh, no query-string URLs, inspect/remove/refresh available. Brain Lab intentionally uses real uncached web and no owner Notion. No extra Docker container required.

Brain Lab on NAS captures raw responses, sources, timing, actual model, memory IDs and execution errors without grading. Public planners use a structured tool, with an explicit task kind and larger output budget. Strict research can attempt one native-generated candidate recovery search and revalidate evidence; optional factual synthesis passes a conservative lexical and citation check against native-approved quotes (not semantic entailment). Recommendation output includes validated counts and credits. Release-year constraints require an explicit event-year predicate, not merely a date on a webpage.

### Stable and experimental release channels
Main publishes the tested image to `stable` and the legacy `experimental` compatibility alias. The dedicated `preview` branch publishes ONLY to `preview`. PR builds never publish. Preview releases must keep persisted data backward-compatible with stable; no destructive schema changes on preview. Channel changes use the same stop/backup/maintenance/verification/rollback path and keep all current data, not an old snapshot. The selected channel is stored in root-owned updater state; the app only queues fixed switch-stable/switch-preview actions. Both channels auto-update when idle once selected. Switching back is a deliberate installation of the stable image and may be a version downgrade. A failed candidate leaves the previous working image running and the selected channel pending a newer compatible build.

**One-time host upgrade:** after this stable build is installed, run as root on Beholder (never while an update is active):

```sh
cd /volume1/docker/mikan/nas
cid=$(docker compose -f compose.yaml -f compose.registry.yaml ps -q mikan)
docker cp "$cid":/app/nas/update-beholder.sh /root/mikan-updater/update-beholder.sh.new
docker cp "$cid":/app/nas/update-control-host.sh /root/mikan-updater/update-control-host.sh.new
chmod 700 /root/mikan-updater/*.sh.new
sh -n /root/mikan-updater/update-beholder.sh.new
sh -n /root/mikan-updater/update-control-host.sh.new
cp -p /root/mikan-updater/update-beholder.sh /root/mikan-updater/update-beholder.sh.bak
cp -p /root/mikan-updater/update-control-host.sh /root/mikan-updater/update-control-host.sh.bak
mv /root/mikan-updater/update-beholder.sh.new /root/mikan-updater/update-beholder.sh
mv /root/mikan-updater/update-control-host.sh.new /root/mikan-updater/update-control-host.sh
sh /root/mikan-updater/update-control-host.sh
```

Temporarily disable the scheduled DSM task during the replacement and re-enable it afterward. Confirm the installed container is the reviewed stable revision before copying scripts. Existing updater stays stable until upgraded; it never self-updates root code. A later status poll exposes the channel selector in Software Updates. No arbitrary branch or registry URL accepted from the browser.

### Experimental native public tool loop (separate branch)
Opt in with `MIKAN_PUBLIC_AGENT=1` in the NAS service environment on an isolated test deployment. NVIDIA only initially; Gemini/OpenRouter retain the existing route. The model receives actual search/read function definitions and tool-result messages, rather than executing a separate web planner. Limits: Simple up to four model calls, two searches and two reads; Strict up to six model calls, three searches and four reads; all share the existing quota ledger. Eight stable numbered sources. Only retrieved source IDs or current user URLs can be read; existing public-IP checks remain. Private memory and Notion are not exposed to the public tool loop. Strict checks the native candidate shortlist when supplied and otherwise uses the existing lexical citation check, not semantic entailment. Nonresearch turns use the ordinary memory/persona chat path. This is an opt-in prototype, not a replacement for the deployed backend; no production publishing from this branch.

Brain Lab on this branch also exposes Research engine > Native tools (experimental) for NVIDIA. The choice is recorded in each JSON report. Test runs use isolated fixtures and the ordinary conversation pipeline remains unchanged unless explicitly enabled with the environment flag. The private-query filter is conservative; explicit no-browse or sensitive disclosures bypass the agent. No current claim is presented when the agent skips an explicitly current lookup. This is not yet live-provider verified.

### Preview: model-led synthesis (revision 2)
The experimental engine exposes only search/read tools and reserves a separate ordinary answer generation (no tool schema; default provider reasoning, 6144/8192-token budget). Simple permits up to four tool decisions plus one answer, Strict six plus one; both reserve one request for synthesis. Legacy typed tasks, native recommendation rejection, and lexical rewriting no longer gate this experimental path. Strict asks the model to check claims and constraints before replying and permits more research; this is not a deterministic factual guarantee. Citation index problems are logged and qualified without discarding useful prose. Discarded public model text is captured only in isolated Brain Lab; production logs contain reason codes, not drafts or reasoning. More source handles, targeted reads, current date, and improved quoted-attribute HTML extraction are included. Legacy engine, privacy/SSRF checks, quota limits and Notion path remain unchanged. No schema migration; preview only.
