# Mikan Desktop Companion v0.5.4 · Windows setup

This is a local-first, single-PC prototype. User-specific settings and the selected character portrait remain saved locally across upgrades.

## Install

- Install [Ollama for Windows](https://ollama.com/download/windows) and run `ollama pull qwen3.5:9b`, or download another model. Ollama uses `http://127.0.0.1:11434`.
- Download the latest successful **mikan-windows-installer** artifact from [GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml), unzip and run the NSIS setup executable. Install over the previous Mikan version.
- For search, install Docker Desktop with WSL2 (free for personal use) and run the SearXNG [one-time setup](tools/searxng/README.md). A model alone does not perform web requests.

## Boot behavior and SearXNG controls

Previous releases used `restart: "no"`, which means SearXNG does not automatically start after a reboot. The v0.5 Compose file uses `restart: unless-stopped`.

With v0.5 installed, type `/search-start` **once**. It enables Docker's `unless-stopped` restart policy on the existing named `mikan-searxng` container, then starts it. Thereafter it will restart with the Docker engine, **unless you deliberately stop it**. To make this happen automatically on Windows login, enable **Docker Desktop → Settings → General → Start Docker Desktop when you sign in**. This is optional if you prefer to keep Docker off until needed.

Manage the existing container entirely inside Mikan:

- `/search-start`: start SearXNG; enables Docker restart policy
- `/search-stop`: stop SearXNG; stopped state persists across reboot
- `/search-status`: check Docker/container state

Equivalent Start/Stop/Status buttons are at **Settings → Internet**. Initial installation of the container is still a one-time manual step.

**Automatic search startup & recovery** is a separate setting from Automatic web tools. When enabled, Mikan checks whether the configured SearXNG HTTP endpoint responds. If the built-in `mikan-searxng` service on port 8888 is unavailable, she attempts to launch Docker Desktop (if installed), start a stopped container, or restart an unresponsive container. Checks occur every 45 seconds while healthy and more frequently during startup. Failed recovery attempts are rate-limited to prevent a restart loop. A small dot on the Search icon indicates ready (green), starting (amber), or unavailable (red); hover for details.

For existing installations with Automatic web tools enabled, automatic recovery is enabled on upgrade. Otherwise it stays off until you enable it under Internet settings. Pressing **Stop** or typing `/search-stop` disables recovery so the container stays stopped. You can turn it back on in settings. Custom local SearXNG endpoints are monitored but never auto-restarted. Docker Desktop may briefly open its window when launched; enabling its own login startup remains an option.

## Settings

The Settings drawer is split into **AI & Models**, **Internet**, and **Appearance** tabs:

- **AI & Models**: Ollama endpoint, model picker, system/persona prompt. Current model can also be switched from the compact dock.
- **Internet**: SearXNG endpoint and service management, optional automatic web tools, webpage cache TTL and clear-cache control.
- **Appearance**: portrait, accent and panel colors, opacity, and fonts.

Personality sliders/presets now exist **only in the separate Personality drawer**, not duplicated inside Settings. Changes to normal settings are saved using **Save settings**; the Personality drawer applies changes immediately.

## Search, browsing, caching

- `/search Fear Factory news` opens SearXNG results; **Ask Mikan** summarizes search snippets and includes links in the log.
- `/read https://example.com/article` reads an eligible public HTTPS page and caches its article text.
- Search results have **Read full page** actions when the URL is HTTPS. The page reader can return cached content, refresh it, and pass the page text to Mikan.
- **Automatic web tools**, off by default under Settings → Internet, let tool-capable Ollama models decide when to call `search_web` or `read_webpage`. Normal chat remains faster with automatic tools disabled. Automatic mode adds planning work and might be slower; unsupported models will show an error so you can disable the option or choose another model.

Web requests go through the Rust backend, not the browser UI. Search queries go through your local SearXNG container to outside search providers; webpage reads contact outside hosts. Results and page text are untrusted evidence, not authoritative instructions. The model can still misinterpret sources.

The webpage reader is intentionally limited to public **HTTPS URLs on port 443**, with pinned public IP address resolution, no proxies or redirects, no cookies, a maximum 1.25 MB response and 16,000 characters of extracted text. Sites that require login, rely heavily on JavaScript, block automated access, or redirect may fail. Only article/main content or paragraph text is extracted; images and PDFs are not read in this iteration.

The local page cache expires after the TTL you set (default: 24 hours). At most 150 page files are retained, stored in Mikan's local app-data directory rather than in model training weights. You can inspect the page count and clear it under Internet. Clearing or refreshing does not affect your conversations.

## Date awareness and time-sensitive search (v0.5.1)

Every Ollama chat turn includes a fresh system context with the current host-computer clock, shown in **America/Detroit** (Eastern Time, correctly using EST in winter and EDT in summer), plus a UTC timestamp. This is automatic, not something you need to add manually to each persona's system prompt.

The app also guides the model to disambiguate unusual proper nouns based on the conversation, use automatic web tools when someone asks it to find current information, and avoid interpreting past album releases or old announcements as upcoming news. On-demand search summaries now emphasize source dates and verification of future releases. Model mistakes can still happen, so the chat log preserves source links for checking.

## Chat and other shortcuts

- **Ctrl+Alt+M** shows/hides Mikan, returning to compact chat when shown; drag the portrait to move the window.
- Enter sends; Shift+Enter inserts a line.
- `/help` shows the clickable list of available commands; `/log` shows the current session history and Ollama timing/token diagnostics.
- `/personality`, `/presets`, `/preset cozy`, `/randomize` customize her mood.
- `/settings` opens Settings, `/internet` opens the Internet tab, `/appearance` opens the Appearance tab; `/new` clears the current chat.

Chat history remains in memory only until quitting. Long-term memory, screen vision, voice, and documentation-library indexing are later features.

## Development

Install Node.js 22+, Rust, MSVC C++ build tools and WebView2 per https://v2.tauri.app/start/prerequisites/, then:

```powershell
git clone https://github.com/capnolithyl/AI-Desktop-Companion.git
cd AI-Desktop-Companion
npm install
npm run desktop
```

The signed/unsigned installer is produced by GitHub Actions or `npm run package:windows`. The personal build is unsigned, so SmartScreen may show an unknown-publisher warning.

## Evidence-first web research (v0.5.2)

With **Automatic web tools** enabled, explicitly asking to search or find something, get recent news, or find a new album now runs a real SearXNG search **before** the local model responds. The app builds a query from the user's own topic, adding music context from earlier user turns when it helps. The LLM cannot silently reinterpret your request into an unrelated search query.

Search answers receive a strict evidence-only instruction with numbered source snippets and optional publication dates, and are generated using the existing Ollama streaming API. Previous assistant statements are excluded from the factual research context; user questions and clarifications are preserved. When no results are found, Mikan says so rather than fabricating research. This forced search works even with local models that do not implement Ollama tool calling.

The **Conversation Log** shows the exact SearXNG query and expandable evidence snippets alongside the model's response. These are *retrieved sources*, not independently fact-checked citations: the model can still make mistakes. Review important claims against the source excerpts. Manual searches using `/search` remain available regardless of the auto-search setting. Casual offline conversation remains unchanged.

A source link beneath a reply means that source was returned by SearXNG; it does not prove every statement in the reply is supported.

## v0.5.3: research intent and recency

With Automatic web tools enabled, everyday information questions such as `Can you tell me more about Cattle Decapitation?` and `Can you give me info on the band Cattle Decapitation?` are routed to SearXNG before the local model answers. Previously only explicit `find`/`search`/news requests were reliably routed.

Search query construction treats `the band` as an entity type, not part of the exact-quoted artist name. An album follow-up searches for *next album / recording / studio / announcement*, and checks both recent results (SearXNG's past-year filter, where supported) and general results, avoiding unrelated pages where possible.

The model is still not a fact-checking engine, and independent source verification may be necessary. If no reliable upcoming-album confirmation is retrieved, it should admit the release date is unconfirmed rather than turning a historical release into an upcoming one. The source excerpts and exact query remain visible in `/log`.

## v0.5.4: Clear facts, clearly labeled guesses

Mikan remains conversational during research. When the retrieved sources establish facts, she should cite those facts inline using source numbers. Predictions and educated guesses are welcome, but she must explicitly say they are guesses and avoid implying a projected release date is officially confirmed. She should cite the evidence that motivates a prediction, not present the prediction itself as sourced fact.

Follow-up answers should retain the established topic without asking again whether you meant the same band or other entity. This update also fixes the formatting of search snippets handed to Ollama: actual line breaks now separate source numbers, URLs, publication dates and excerpts. These instructions improve behavior but cannot guarantee perfect citations from every local model.
