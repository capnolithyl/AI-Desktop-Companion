# Mikan v0.1: Windows setup

This is a first local-chat prototype. No subscriptions, remote API keys, speech or memory yet.

## Fastest route: prebuilt Windows installer

1. Open the repository's **Actions** tab, select **Windows installer**, and choose the most recent successful run. If needed, choose **Run workflow**.
2. Download the `mikan-windows-installer` artifact, unzip it, and run the `-setup.exe` file. The installer is not code-signed; Windows SmartScreen may warn about unknown publishers.
3. Install Ollama for Windows: https://ollama.com/download/windows
4. Open PowerShell and run: `ollama pull qwen3.5:9b`
5. Start Mikan and open **Settings**. The default local endpoint is `http://127.0.0.1:11434`. Click **Refresh models** and choose one.
6. Mikan's bundled portrait is loaded automatically when `public/mikan.png` is present at build time. The optional portrait picker in Settings lets you override it with an image stored locally in IndexedDB. **The original portrait asset is still pending addition to GitHub, so current builds continue to show the picker.**
7. Type a message and press Enter. Shift+Enter inserts a newline.

The default model is only a starting point. AMD RX 9070 acceleration on Windows depends on the installed Ollama version and backend. If performance is poor, benchmark llama.cpp with Vulkan later.

## Development setup

Install Node.js 22+, Rust, MSVC C++ build tools, and WebView2 per https://v2.tauri.app/start/prerequisites/.

```powershell
git clone https://github.com/capnolithyl/AI-Desktop-Companion.git
cd AI-Desktop-Companion
npm install
npm run desktop
```

The desktop script generates icons from `assets/mikan-icon.svg` and starts Tauri dev mode. To build an installer locally, run `npm run package:windows`.

## Current capabilities

- Typed, streamed multi-turn conversation with local Ollama
- Adjustable model, loopback endpoint, and character system prompt
- In-session chat history, New chat, connection status, error feedback
- Custom local still portrait and speech bubble
- Windows tray icon and Ctrl+Alt+M toggle (may conflict with another shortcut)
- No API keys required for Ollama

## Limitations / next steps

- Voice, screen vision, internet access, persistent conversations and long-term memory are not implemented yet.
- Model, endpoint and prompt settings persist locally. Chats do not persist after closing.
- Ollama runs separately and is not bundled with Mikan.
- Only loopback HTTP Ollama endpoints are supported. Remote API keys and remote endpoints are intentionally not supported in this first version.
- Closing the window hides it to the tray; use **Quit Mikan** in the tray menu to exit.
- Initial install may depend on WebView2 availability.
- This is an experimental build. The GitHub workflow must complete successfully to prove the Windows installer works.

## Bundling the default portrait

Place the original Mikan portrait at `public/mikan.png` (not a replacement or a generated approximation) and commit it. Vite copies assets from `public` into the packaged app automatically. The app uses that asset by default, but any manually chosen portrait stored in IndexedDB takes precedence. This is a pending asset, not yet included in the repository.
