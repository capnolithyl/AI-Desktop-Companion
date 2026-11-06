# Mikan Desktop Companion v0.4.1 (Windows)

A free, local-first personal AI companion. This is an experimental build for one Windows 11 PC.

## Install / update

1. Open the latest successful [Windows installer workflow](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml).
2. Download the `mikan-windows-installer` artifact, extract it and run the NSIS setup executable. Install over your existing version.
3. Keep Ollama running with one or more locally downloaded models. Endpoint: `http://127.0.0.1:11434`.
4. Your previous settings and selected portrait should persist across upgrades in the Tauri WebView data. If the avatar is missing, choose your existing Mikan PNG under Settings.

Unsigned personal builds may trigger Windows SmartScreen. Examine the GitHub workflow/source before running.

## Internet access (SearXNG)

See [tools/searxng/README.md](tools/searxng/README.md) for the Windows Docker Desktop setup. After starting SearXNG, enter `http://127.0.0.1:8888` in Settings. `/search query` or the search icon opens results; **Ask Mikan** passes snippets to the selected Ollama model with source links. Regular chat does not search automatically yet.

## Interaction

- Hold left mouse on the portrait and drag to move the companion. The old floating **Drag Mikan** button is gone.
- History, settings and hide buttons are inside the compact chat dock.
- **Ctrl+Alt+M** toggles Mikan and always restores compact chat when showing.
- Enter sends; Shift+Enter inserts newline.
- `/log` or `/history` opens the complete session chat, with per-assistant-message timing, token counts, and model throughput.
- `/search your query` searches through locally running SearXNG; `/settings` opens settings; `/chat` returns to compact; `/new` and `/clear` start a new in-memory conversation.
- Models installed through Ollama appear automatically in the model dropdown in Settings and in the compact dock footer. Use the refresh icon after pulling a model while Mikan is open. Selecting a model in the dock saves it immediately; choosing one in Settings takes effect when you click Save. No restart or API key needed. The current conversation remains intact after switching, so start a new chat if you want an apples-to-apples comparison. If Ollama is offline or a model is missing, Settings also accepts manually typed model names.
- Replies and conversation history are rendered as Markdown (italic `*actions*`, bold, lists, code, links, and tables), not as plain text.
- Under Settings > Appearance, change accent color, panel color, panel opacity, font family, and message font size. These persist locally.

The model's stage directions remain in the **displayed** response and chat history. When local voice synthesis is implemented, we should exclude those descriptions from spoken output rather than reading them aloud. This feature has not been implemented yet.

## Technical notes

The window is `transparent: true` / `decorations: false` / `shadow: false`. Tauri's Windows shadow setting can add a 1px border and rounded corners to undecorated windows when enabled; disabling it should eliminate the remaining native frame. Some GPU/window-compositor quirks may still need hands-on Windows validation. Transparent areas of the native window can still intercept mouse clicks; pixel-perfect click-through is a separate feature.

The color themes use CSS variables; no themes or font downloads are required. The default font is Segoe UI, with installed Arial, Verdana, and Georgia alternatives. The Markdown renderer does not enable raw HTML injection.

Chats and diagnostics are session-only; they disappear after quitting the application. No web access, VRM model, TTS, screen capture, or long-term memory yet.

The original bundled Mikan PNG is only included once `public/mikan.png` is added to GitHub. Previous user-selected portraits remain in local IndexedDB.

## Local development

Install Node.js 22+, Rust, Windows MSVC C++ build tools, and WebView2 as instructed at https://v2.tauri.app/start/prerequisites/.

```powershell
git clone https://github.com/capnolithyl/AI-Desktop-Companion.git
cd AI-Desktop-Companion
npm install
npm run desktop
```

Build locally using `npm run package:windows`. GitHub Actions builds and uploads the unsigned Windows NSIS installer after pushes to main.

Roadmap: https://trello.com/b/bLO0mXJM/ai-desktop-companion
