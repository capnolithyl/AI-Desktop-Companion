# Mikan Desktop Companion v0.2 (Windows)

A free local-first personal AI companion. **This is an experimental development build.**

## Install / update

1. In [GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml), open the newest **successful** Windows installer run.
2. Download its `mikan-windows-installer` artifact, extract the ZIP, and run the Windows installer. Install over v0.1 if it is already installed.
3. Keep Ollama running. Install and pull a model if needed: `ollama pull qwen3.5:9b`.
4. Mikan connects to Ollama on `http://127.0.0.1:11434`; choose your installed model in Settings.
5. The app loads a bundled `public/mikan.png` by default **if present in the build**. If not bundled, choose the original portrait once in Settings. Saved custom portraits are kept across app upgrades in WebView IndexedDB.

Model storage on Windows defaults to `%USERPROFILE%\.ollama\models`. Ollama is free, requires no API key for local operation, and runs separately from Mikan.

If Windows shows a SmartScreen unknown-publisher warning, this is because the personal hobby build is unsigned. Check the workflow and commit before deciding to run it.

## Everyday controls

- **Ctrl + Alt + M:** show/hide the companion. Whenever shown, it returns to the compact chat view, including when hidden from Settings or the log.
- **Drag Mikan:** use the grip labeled "DRAG MIKAN" above the portrait to move the frameless window.
- **Enter:** send; **Shift+Enter:** new line.
- **History / settings icon:** opens the corresponding drawer.
- **`/log`** or **`/history`**: open the full conversation log.
- **`/settings`**: open settings.
- **`/chat`**: go back to the compact companion.
- **`/new`** or **`/clear`**: start a new in-memory conversation.

Slash commands are interpreted by the local UI and are never sent to Ollama.

## Conversation log diagnostics

Each completed assistant reply has an optional diagnostics row:

- **Wall time:** app-observed elapsed time from sending request to completion.
- **First token:** app-observed time until first streamed reply text, when observed.
- **Output:** Ollama's `eval_count` (generated tokens).
- **Speed:** `eval_count / (eval_duration / 1e9)`, tokens per second.
- **Prompt:** Ollama's `prompt_eval_count`.
- **Model time, load time, prompt eval:** durations from Ollama, converted from nanoseconds.

Some models/providers may omit counters, so missing metrics are not estimated. Diagnostics appear **only in the log**, not on the live portrait/bubble.

## Build from source

Install Node.js 22+, Rust, MSVC C++ build tools, and WebView2 according to https://v2.tauri.app/start/prerequisites/.

```powershell
git clone https://github.com/capnolithyl/AI-Desktop-Companion.git
cd AI-Desktop-Companion
npm install
npm run desktop
```

Build the NSIS installer locally with `npm run package:windows`.

## Current boundaries

- v0.2 supports text and Ollama streaming only.
- Conversations and per-message metrics last until the app exits. Durable conversation history is a future feature.
- Voice, screen capture, web search, and VRM animation are not implemented yet.
- Only loopback Ollama endpoints are supported. No cloud API keys in this release.
- The window is visually transparent, but transparent space may still intercept mouse input. True pixel-perfect click-through would require a future native hit-testing feature.
- The bundled original Mikan image will only be included when `public/mikan.png` is committed. A manually selected local portrait still works and persists.

## Project

Source: https://github.com/capnolithyl/AI-Desktop-Companion

Roadmap: https://trello.com/b/bLO0mXJM/ai-desktop-companion
