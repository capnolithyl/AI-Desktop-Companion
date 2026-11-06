# Mikan Desktop Companion

A local-first, personal Windows AI desktop companion powered by Tauri 2, React, TypeScript, and Ollama. Free hobby project for one PC.

**v0.5 (pending Windows validation):** integrated Docker/SearXNG lifecycle controls, organized Settings tabs (AI, Internet, Appearance), separate personality presets, optional model-directed web tools, safe public HTTPS reader, and on-disk webpage caching.

## Getting started

1. Install Ollama for Windows and download a model (such as `qwen3.5:9b`).
2. Download the newest **successful** Windows installer from [GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml).
3. For internet search, follow the [SearXNG Windows setup](tools/searxng/README.md) once. The Docker container is separate from the desktop app.
4. Open Mikan with Ctrl+Alt+M, or use the tray icon. Change model, appearance, and search settings under Settings.

See [SETUP.md](SETUP.md) for shortcuts, slash commands, automatic search and cache limitations. Roadmap: [Trello](https://trello.com/b/bLO0mXJM/ai-desktop-companion).
