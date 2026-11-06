# Mikan Desktop Companion

A local-first, personal Windows AI desktop companion powered by Tauri 2, React, TypeScript, and Ollama. Free hobby project for one PC.

**v0.6.2:** Research follow-ups can reuse previously retrieved source excerpts, with clear stale-source labeling. Optional 4K/8K/16K/32K per-request context setting under AI & Models, preserving the Ollama default unless changed. Schedule-specific follow-ups now search for verified dates rather than extrapolating from AI summaries.

**v0.6.1:** Improved search-query extraction for multipart questions and a broader SearXNG retry when research initially returns zero results.\n\n**v0.6.0:** First local SQLite memory layer: persistent conversations and explicitly saved user facts, with a memory inspector and slash commands. Previous v0.5.4 features:  Conversational, explicitly labeled speculation grounded in evidence; continuity across follow-ups and improved inline citation guidance; expanded web-research triggers and recent-album queries; evidence-first search with transparent queries and source excerpts, per-turn Eastern date/time context, stronger search chronology/disambiguation, integrated Docker/SearXNG lifecycle controls, organized Settings tabs (AI, Internet, Appearance), separate personality presets, optional model-directed web tools, safe public HTTPS reader, and on-disk webpage caching.

## Getting started

1. Install Ollama for Windows and download a model (such as `qwen3.5:9b`).
2. Download the newest **successful** Windows installer from [GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml).
3. For internet search, follow the [SearXNG Windows setup](tools/searxng/README.md) once. The Docker container is separate from the desktop app.
4. Open Mikan with Ctrl+Alt+M, or use the tray icon. Change model, appearance, and search settings under Settings.

See [SETUP.md](SETUP.md) for shortcuts, slash commands, automatic search and cache limitations. Roadmap: [Trello](https://trello.com/b/bLO0mXJM/ai-desktop-companion).
