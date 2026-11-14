# Mikan Remote (experimental)

This is a **browser relay for the same running Windows Mikan**, not another AI.
The existing Tauri desktop UI handles local Ollama, persona instructions,
SQLite conversation history, Mem0 recall, web tools, automatic memory,
and conversation summaries. The browser sends chat turns into this existing
pipeline and mirrors the currently active desktop conversation.

## What works

- Text chat from a modern web browser, including partial responses as the
  desktop receives them. Phone and PC share the desktop's SQLite chat archive.
- Create new chats and switch between saved conversations from the browser.
  Selecting a chat also selects it on the desktop; both surfaces always use
  the same active conversation.
- Choose the same inference modes as the desktop dock: an installed Ollama model,
  OpenRouter free, Gemini or Auto (OpenRouter then local fallback). The phone
  can refresh the installed Ollama list, and the header reports the routed
  provider/model. Changes apply to the desktop too and persist in its settings.
  Cloud credentials never leave Windows.
- The browser renders Mikan's actual selected Iki outfit using the same engine
  and animation data: idle breathing/blinks, expressions, and pointer gaze.
  The active rig is loaded on demand; custom imported outfits are passed
  to the relay in RAM, not copied to a new database.
- Local model, personalities, facts, history, and search remain on the PC.
- **Settings → Brain Lab** can start the isolated synthetic test suite on the Windows
  desktop from a phone, watch progress, stop it, and download the latest completed
  JSON or Markdown report. The browser tab can be closed during the run.
  The desktop auto-saves the report, so results are available on the PC even
  if the phone or browser relay disconnects.
- Settings → Report an issue can save detailed private diagnostics locally,
  publish an explicitly reviewed GitHub issue, or do both. The Windows
  report file is `%USERPROFILE%\\.mikan\\remote-issues.jsonl`.
- An extra randomly generated remote key protects chat API requests,
  alongside private Tailscale access (or Cloudflare Access for public deployment).

**Not yet:** voice playback on the phone, file attachments, browser screen
capture, changing advanced settings, arbitrary remote native Tauri commands, or
automatic startup of the Node relay. Iki rendering needs browser WebGL and may take
a moment to load its ~5–6 MB selected outfit on first use.

The desktop must be running (hidden in tray is fine). This first version
starts a separate small Node.js relay which will later be integrated.

## Mobile browser settings

The remote home screen keeps the portrait and chat visible. Open the hamburger
menu in the header for a full-screen settings panel on a phone (a side drawer
on larger screens). It contains:

- Chat picker and **New** chat button (same desktop history).
- Model/provider picker and installed-model refresh (desktop v0.9.7+).
- **Enlarge/Shrink portrait**, **Show model name under Mikan** and
  **Show outfit & animation labels** toggles.
- **Brain Lab** manual run controls (Fast/Live, category, scenario, repetitions),
  progress, stop, and latest report download.
- Issue reporting and **Lock this browser**.

The two label toggles are independent, default to visible, and save only
non-sensitive display preferences in the browser's localStorage. They do
not change Mikan's personality, memories, desktop avatar, or model setting.
The access key remains in sessionStorage and is cleared when locked.
Use the close button, backdrop, or Escape key to exit settings.

The hamburger menu is a browser-relay-only update: once the desktop is
already at v0.9.7 or newer, a git pull and Node relay restart are sufficient.
It does not require reinstalling Mikan or changing Tailscale configuration.

## Locating and reviewing numbered scenarios

Every test displays a global catalog number (#01–#73) regardless of active
filters. The underlying scenario ID stays the same so status history survives.
For the latest completed run, choose **Inspect** beside a failed or review
scenario to see user turns, Mikan's actual responses, conversation review
goals, planned web decisions, and missing fact evidence on your phone.
Historical runs remain in the saved Windows JSON/Markdown report files.

## Selective tests and historical statuses

Each Brain Lab scenario has a checkbox and one of these states:
**Passed, Failed, Review, Stale, Untested, Incomplete**. Filter by category
and status, choose individual tests, or use **Select visible**,
**Select unresolved**, **Passed sample**, and **Clear**.

The desktop persists test status per model/mode/build/fixture; a newer build
makes older results **Stale** rather than silently passing. A subjective
conversation can only be marked Passed after its response is reviewed.
Only checked cases run, preserving all other historical results.

## Remote developer updates (opt-in)

This is for one personal Windows PC and one **pinned** GitHub development branch.
The browser does not get a command prompt, filesystem access, an SSH token or
arbitrary Git branch selection.

**One-time setup on the PC**, in the branch checkout:

1. `git switch feature/p0-brain-evaluation-harness`
2. `git pull --ff-only`
3. `npm install`
4. Stop the old `npm run server` process with Ctrl+C, since it owns port 3847.
5. Start the new **managed relay**:

   ```powershell
   npm run remote:dev
   ```

   Keep this PowerShell window open. Your *installed* desktop Mikan can stay
   running separately, but a Git pull cannot update that installed executable.

Once `npm run desktop` works locally with MSVC C++ Build Tools, you can
instead quit the installed Mikan and launch the **managed dev desktop + relay**:

```powershell
npm run remote:dev -- --desktop
```

That process starts **both** `npm run server` and `npm run desktop`. These
are the only services it is allowed to terminate/restart. You do **not**
need the MSVC toolchain for the first relay-only setup.

**Phone steps:**

1. Open the existing authenticated Mikan browser URL.
2. Go to **☰ → Settings → Developer updates**.
3. Tap **Check GitHub**. The local supervisor checks for a clean working
   tree, correct checked-out branch and approved GitHub origin; it fetches
   only `feature/p0-brain-evaluation-harness`.
4. If newer commits are available, tap **Update & restart**, read the
   confirmation (number of commits and managed components), then approve.
5. The supervisor fast-forwards the checkout and checks whether the actual
   npm **dependency graph** changed. A package version-only change does not
   reinstall anything in node_modules. Real dependency changes first stop
   the supervisor-managed desktop and relay, then install dependencies, run
   the frontend build, Brain Lab tests and remote authentication tests.
   Only after successful validation does it restart the *managed* relay
   and optionally the dev desktop.
6. The phone may disconnect briefly during relay restart. It automatically
   reconnects and reloads after success. Brain Lab can then run again.

If a test/build fails, the supervisor tries to restore the old checkout
without discarding tracked edits. Updates are blocked during an active
desktop chat response or Brain Lab run. All status and errors appear in
the phone Settings panel. This is **manual** updating, not an unattended
GitHub watcher.

**Security:** Only browser requests authenticated with the existing Mikan
remote key can initiate updates. The relay speaks to a separate localhost
supervisor on port **3849** using an ephemeral, random supervisor token
that is never sent to the phone. Do NOT expose/tunnel 3848 or 3849. The
supervisor accepts only fixed check/apply commands and one pinned origin
and branch. It refuses dirty or diverged repositories. Treat changes to
the approved repository branch as trusted executable code; review those
commits before updating and protect the remote browser access key.

**Limits:**

- Relay-only mode can update phone UI/backend without a working Tauri Rust
  toolchain. A standalone desktop app is **not** restarted or modified.
- `--desktop` mode requires the Windows C++ linker and local Tauri tools
  to work. It does not update the installed NSIS executable either.
- An installed desktop .exe still needs a new **Windows installer from CI**
  for its own code changes. That is separate from this dev-source updater.
- The supervisor does **not** self-update/restart its own process.
  Changes to `scripts/remote-dev-supervisor.mjs` require one manual restart
  of `npm run remote:dev` on Windows. This matters for the v0.9.9
  dependency-lock fix: an *already running old supervisor* still uses its old
  logic even after GitHub receives the fix. Stop the managed dev supervisor
  with Ctrl+C, `git pull --ff-only`, and if a failed `npm ci` may have left
  dependencies incomplete, run `npm ci` while managed processes are stopped,
  then `npm run remote:dev -- --desktop`. Subsequent version-only bumps can
  be applied normally from the phone.
- Leave the PC awake; no updates are applied if the supervisor is offline.

## Overnight Brain Lab runs

The browser is **only a remote controller**; desktop Mikan performs the
synthetic evaluation and owns its process-lifetime state. To run tests overnight:

1. On Windows, start the desktop companion (hidden in tray is fine), local
   Ollama, and the existing Node browser relay (`npm run server`).
2. Keep Windows awake. Sleep, logoff, restart, quitting desktop Mikan, or
   stopping the relay can interrupt progress or prevent status updates.
3. In the authenticated remote browser, open **Settings → Brain Lab**, select
   Live or Fast mode, the whole catalog/category/scenario and 1–5 repeats.
4. Tap **Start** once. The browser shows progress in turns and can be closed.
   The local runner continues while Mikan's desktop process stays alive.
5. In the morning, reopen the browser to see the progress/result summary and
   **Download JSON** or **Download Markdown**. Results are also automatically
   stored under `Documents/Mikan/Brain-Evaluations` (AppData fallback).

The browser relay holds only the latest completed **synthetic** evaluation
report in RAM. If the relay restarts, the desktop automatically re-uploads that
report when it reconnects, as long as desktop Mikan hasn't restarted.
The auto-saved local files remain the durable copy on Windows.

The remote key and same-origin controls also protect these endpoints. The
browser cannot send arbitrary prompts or shell commands to this runner:
requested scenarios must match the catalog published by the desktop, and all
model inference runs locally with public web tools disabled.

**Scope:** the available Live mode tests local Ollama behavior, deterministic
routing, and a simulated AI web decision. It does not make real SearXNG,
GitHub, Notion or Qdrant calls. Actual integrations remain a P0 follow-up.
A completed run may still contain conversations marked **REVIEW**; a high
automatic pass rate is not the same as human-verified conversational quality.

## Report diagnostics and optional GitHub issues

In **Settings → Report an issue**, describe the problem and choose one of
three destinations:

- **Save on my PC (private)** is the default. It appends a JSON object to
  `%USERPROFILE%\\.mikan\\remote-issues.jsonl` containing the note, time,
  current conversation ID, last 8 short chat excerpts, browser information,
  selected inference provider, desktop version, recent model latency and
  token metrics, memory retrieval counts, research/tool outcomes, notion
  read status, failure reasons, and avatar render diagnostics. The file does
  not leave the computer automatically.
- **Create GitHub issue only** publishes to
  `capnolithyl/AI-Desktop-Companion`, but **only after you select
  Review GitHub issue and see its exact title and body**. The public body
  includes your own note and non-sensitive model/performance statistics.
  It excludes chat transcripts, conversation IDs, memories, private URLs,
  search queries, manuscript titles, local paths, and private error strings.
  Assume issues are public; inspect your note for secrets before confirming.
- **Save on PC + create GitHub issue** does both. A GitHub failure does not
  discard the local report, and the UI tells you if the issue failed.

The relay never holds a GitHub token or sends credentials to the phone.
For one-click issue creation, install and sign into **GitHub CLI** once on
the same Windows account that runs `npm run server`:

    winget install --id GitHub.cli -e
    gh auth login
    gh auth status

Select `GitHub.com` and browser authentication when prompted. The GitHub
account must be authorized to create issues on this repository. The relay
calls `gh issue create --repo capnolithyl/AI-Desktop-Companion`, with
reviewed text on stdin, without shell execution, and returns the issue URL.
If `gh` is not installed or authenticated, GitHub publishing fails with a
setup message. Local-only reports work without GitHub CLI. There is a
15-second GitHub publish rate limit to avoid accidental duplicate issues.

Report previews are short-lived, one-time and tied to their original note.
Editing the note or switching the destination requires reviewing again.
The GitHub issue receives the exact text shown in the preview, not a later
or newly generated conversation snapshot. The feature requires desktop
v0.9.8 or newer for full diagnostic details; older versions still produce
basic local reports.

## Local test first

On Windows, with Node.js 22+ and an installed **Mikan v0.8.5 or newer**:

1. In the updated checkout of the GitHub repository (with dependencies installed)
   run:

        npm run server

   This also builds the small browser Iki renderer locally using Vite.

2. Leave that PowerShell window open. In another terminal run:

        npm run server:key

3. Copy the private access key. It is created and stored at
   %USERPROFILE%\.mikan\remote-access.key. Never commit it or share it.
4. Run Mikan desktop and Ollama. Go to http://127.0.0.1:3847 and enter the key.
5. Send a chat message and watch it arrive in the desktop chat.

If the browser says Desktop offline, the desktop app may be an older
build. Install the new Windows build and restart it. The desktop retries
the relay connection automatically.

## Tailscale Serve (recommended for personal access)

This does not require Cloudflare, a custom subdomain, port forwarding or
changing Hostinger DNS. Install and sign into Tailscale on both Windows and
your phone, then run in PowerShell:

    & "C:\\Program Files\\Tailscale\\tailscale.exe" serve --bg http://127.0.0.1:3847

Use your private tailnet hostname in the phone's browser. The relay's
`publicHost` allowlist must match that hostname **without** `https://`.
The personal default is `marcus-vostro.tailc46461.ts.net`.
Keep the local access key too; the web UI stores it only for the browser
tab/session.

Remote chat selection, remote model switching and avatar rendering require
**both** the updated desktop build (v0.9.7 or newer for the model picker)
and the updated `npm run server` process. A changed Node
server alone cannot make an older installed desktop expose chat actions or
its current outfit. Restart both after updating.

## Cloudflare Access (optional public-hostname alternative): CREATE THIS FIRST

In Cloudflare dashboard → Zero Trust → Access controls → Applications:

1. Create application → Self-hosted / public hostname.
2. Name: Mikan.
3. Hostname: mikan.marcusborger.com (the entire hostname, all paths).
4. Add an Allow policy with Include → Emails → your **one exact email**.
5. Authentication: existing identity provider, or enable One-time PIN at
   Zero Trust → Integrations → Identity providers.
6. Save the Access application/policy. A 24-hour session is a sensible starting point.

**Never use Everyone or a catch-all "Login Methods: One-time PIN" Allow policy.**
Those settings could grant access to anyone with an email address.
Do not expose the tunnel before Access is installed and restricted.

## Cloudflare Tunnel

Cloudflare dashboard → Networking → Tunnels:

1. Create a tunnel named mikan-pc.
2. Use the dashboard's Windows connector setup instructions. Install
   cloudflared as a service on your Windows PC with its provided command.
3. Add a Published application route:
   - Hostname: mikan.marcusborger.com
   - Service type: HTTP
   - Service URL: http://127.0.0.1:3847
4. Save, check tunnel status, then visit
   https://mikan.marcusborger.com on cellular data.

The dashboard-managed tunnel creates the DNS route for you. You do **not**
need to buy a second domain, add a manual A record, or configure router
port forwarding.

**Never tunnel port 3848**, Ollama port 11434, SearXNG port 8888,
or any private database or model service.

You should see Cloudflare Access authentication first, then Mikan's
own remote access key prompt.

## Daily usage

- PC turned on, awake, connected.
- Ollama running and Mikan desktop (v0.8.5+) running.
- Node relay running from the repo with npm run server.
- cloudflared connector/service connected.
- Browser uses same model and conversation active in desktop app.
- Review issue notes in the local JSONL file when you develop again.

Keep the PC from going to sleep (turning off the screen is fine).
The relay must be launched manually in this initial build; automatic
startup is not implemented yet.

## Security and limitations

Only the loopback public listener (127.0.0.1:3847) is exposed via Tunnel.
A separate loopback desktop-agent listener (127.0.0.1:3848) communicates
with the already-running Tauri frontend. There is no second SQLite
writer or competing inference engine, and the public API cannot invoke
Tauri commands directly. Incoming chat is limited to ordinary text;
slash commands, files and screen capture aren't accepted by the browser.

The relay holds a snapshot in RAM; it only writes issue reports when
requested. The remote key stays in the Windows user profile, and the
browser keeps it in per-tab sessionStorage, not a permanent login cookie.
Rotate it if exposed by replacing or deleting the key file and restarting
the relay. Cloudflare relays HTTPS requests, so remote chat content is
transmitted through Cloudflare; don't call this fully offline/private
traffic once remote access is enabled.

## Troubleshooting

- Page won't open locally: Node process stopped, wrong version or port 3847 in use.
- Desktop offline: desktop app quit, bridge not in installed version, or
  Windows/Tauri is blocking requests to localhost:3848.
- 502 from Cloudflare: tunnel connected but local Node relay unreachable.
- Missing Access login page: verify the Access application matches the
  full hostname **before exposing remote chat**.
- Chat rejected: desktop busy or another message queued.
- No voice: browser TTS streaming is not part of this version.
- Avatar not visible: update both desktop and server, verify WebGL is supported
  in the phone browser, and check `npm run server` built the avatar runtime.
  For "Avatar texture loading failed", ensure your checkout includes the
  remote CSP fix allowing `connect-src 'self' data:`: Iki decodes embedded PNG
  textures via `fetch(data:...)`. Restart the Node relay after pulling.
  If textures still fail, check the browser WebGL limits or console errors;
  the problem may be a GPU texture-size or decode limit instead.

Official instructions:
- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
