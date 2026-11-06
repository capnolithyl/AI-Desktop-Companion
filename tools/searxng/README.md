# SearXNG for Mikan (Windows 11)

Mikan uses **your own local SearXNG container**, with no paid search API account or per-query billing. SearXNG aggregates searches from other engines; those engines can still rate-limit requests, so unlimited local API calls do not guarantee unlimited upstream requests.

All incoming traffic is bound to **127.0.0.1:8888**. Do not forward this port on your router or expose it publicly.

## First-time setup

1. Install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/). Docker Desktop is free for personal use. Choose the Linux/WSL2 backend. If it asks for WSL2 or a restart, complete those steps and launch Docker Desktop.
   
   You can install via PowerShell:
   
   ```powershell
   winget install -e --id Docker.DockerDesktop
   ```

2. Download/clone this repository. If you already cloned it, run `git pull` in the repo directory.
3. Open a new PowerShell in the repo and run:

   ```powershell
   cd .\tools\searxng
   powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
   ```

   This creates your **private, randomly generated** `.env` secret (never committed to Git) and downloads/starts the official SearXNG Docker image. The first launch may take a little longer.

4. Test that the local instance is working:

   ```powershell
   Invoke-RestMethod "http://127.0.0.1:8888/search?q=searxng&format=json" |
      Select-Object -ExpandProperty results |
      Select-Object -First 3 title,url
   ```

   You can also open http://127.0.0.1:8888/ in your browser. If the JSON request gets HTTP 403, confirm `config/settings.yml` includes `search.formats: [html, json]` (enabled in this repository), then run `docker compose restart`.

5. Install the newest Mikan build from GitHub Actions. In **Settings → Internet search**, use `http://127.0.0.1:8888` and save.

## Try it in Mikan

Type **`/search Cattle Decapitation latest album`**. The search drawer shows up to 8 source results with links that open in your regular browser. Click **Ask Mikan** to make your currently selected Ollama model answer using those search snippets and cite the sources. You can also open the drawer via the magnifying glass icon and type a query there.

Web search is **explicit-only in this first version**. Regular questions do not automatically trigger web searches. Mikan reads snippets, not the full linked pages; full-page extraction, caching, and autonomous tool calls will come later. The local model might make mistakes, so verify important information against the linked sources.

## Stop and restart

While in `tools/searxng`:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\stop.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File .\start.ps1
```

The service has `restart: "no"` so it doesn't silently resume when Docker Desktop starts. Your Ollama setup is independent of SearXNG. Closing Mikan does not stop its Docker container.

To troubleshoot: `docker compose logs --tail 80`.

## Security and privacy

- No search-provider keys or paid quotas are required.
- SearXNG runs locally, but it sends search requests to external engines. Your search queries **do leave your PC**.
- Mikan's Rust backend validates the configured endpoint, permits **only localhost / 127.0.0.1**, restricts query lengths, times out requests, limits response size, and rejects non-HTTP(S) result links.
- Result snippets are **untrusted external content**. The prompt tells the model not to follow instructions in results. This reduces risk, but is not a perfect prompt-injection defense.
- External result URLs are opened in your default browser through the Tauri opener plugin, not in Mikan's app window.
- No search result caching or persistent conversations in this first version.

## Starting after Windows restarts (v0.5)

Docker Desktop must itself be running. Enable **Docker Desktop → Settings → General → Start Docker Desktop when you sign in** if you want hands-free startup. The Compose file now uses `restart: unless-stopped` so the container restarts with Docker unless you explicitly stopped it. To update an existing container's policy without recreating it, Mikan's new `/search-start` command performs `docker update --restart unless-stopped mikan-searxng` first. Mikan also supports `/search-stop` and `/search-status` and Settings → Internet controls. One-time initial Docker/Compose installation is still required.
