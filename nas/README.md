# Mikan on Beholder: experimental NAS deployment

An independent, **cloud-inference-only** Mikan chat service for the Synology DS916+ (8 GB RAM). It runs in one lightweight Docker container, keeps a durable SQLite database on a NAS volume, and exposes a responsive browser chat on private Tailscale HTTPS.

**This is an experimental vertical slice, not a drop-in replacement for desktop Mikan.** The existing Windows app, remote relay, and Android client are unchanged. This deployment supports chat, streaming NVIDIA/OpenRouter replies, Gemini replies, persistent conversations, explicit user facts, and simple relevance-based recall from an imported desktop SQLite database. Persona file overrides are supported.

**Not yet ported:** desktop tool orchestration, autonomous memory extraction, Qdrant/advanced memories, Notion, SearXNG web research, desktop/phone synchronization, voice, Iki animation, screen vision, outfit switching, and Brain Lab. Some old conversations and memories will appear after importing SQLite, but the full desktop character configuration is not automatically migrated. There is deliberately no public tunnel and no automatic synchronization. Never treat this as a complete migration or delete the Windows copy.

## 1. Gather the files on Windows

Use the **feature/nas-cloud-mikan-experimental** PR branch (not main yet). From your existing checkout:

```powershell
git fetch origin feature/nas-cloud-mikan-experimental
git worktree add ..\AI-Desktop-Companion-NAS origin/feature/nas-cloud-mikan-experimental
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

Design principle: keep this as a parallel proof of concept until it earns the job of Mikan's central backend.

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
