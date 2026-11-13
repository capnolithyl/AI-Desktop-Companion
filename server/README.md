# Mikan Remote (experimental v0.8.5)

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
- The browser renders Mikan's actual selected Iki outfit using the same engine
  and animation data: idle breathing/blinks, expressions, and pointer gaze.
  The active rig is loaded on demand; custom imported outfits are passed
  to the relay in RAM, not copied to a new database.
- Local model, personalities, facts, history, and search remain on the PC.
- "Report" button stores a note and recent excerpts in
  %USERPROFILE%\.mikan\remote-issues.jsonl for reviewing the next day.
- An extra randomly generated remote key protects chat API requests,
  in addition to required Cloudflare Access.

**Not yet:** voice playback on the phone, file attachments, browser screen
capture, changing models/settings, remote native Tauri commands, or automatic
startup of the Node relay. Iki rendering needs browser WebGL and may take
a moment to load its ~5–6 MB selected outfit on first use.

The desktop must be running (hidden in tray is fine). This first version
starts a separate small Node.js relay which will later be integrated.

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

Remote chat selection and avatar rendering require **both** the updated
desktop build and the updated `npm run server` process. A changed Node
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

Official instructions:
- https://developers.cloudflare.com/tunnel/get-started/
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/
