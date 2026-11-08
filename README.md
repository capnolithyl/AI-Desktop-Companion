# Mikan Desktop Companion

A local-first, personal Windows AI desktop companion powered by Tauri 2, React, TypeScript, and Ollama. Free hobby project for one PC.

**v0.7.5:** Shared deterministic evidence guard checks factual sentences against their cited search snippets before presenting the final response. It rejects mismatched years, quoted titles, nonexistent citation numbers and source-described EPs mislabeled as studio albums; missing support produces an explicit uncertainty response. Research drafts remain hidden during desktop streaming until checked. This is conservative filtering, not full semantic verification. Companion Pocket v0.4.8 uses the exact guard with Android-specific retry for AICore foreground interruptions.

**v0.7.4:** Shared conversation engine based on established condense-plus-context patterns: preserve a bounded recent dialogue, retain sourced assistant replies as *conversation* (not trusted evidence), and ask local Ollama to rewrite ambiguous research follow-ups to standalone questions before SearXNG search. Everyday chat does not incur a second inference call. Automatic local-memory extraction now reads Mikan's preceding personal question along with the user's short answer ("Vanilla for sure") without requiring a special learning command. SQLite evidence, duplicate checks, and manual memory edits remain authoritative. Both platforms share the condenser code and tests; Pocket uses local Gemini Nano and Tavily.

**v0.7.3:** Recognize short follow-up requests for missing release dates, titles, singles, and other named details. Inherit the most recent user-named topic, search for updated evidence instead of relying on an old answer, and avoid carrying unrelated names into new research. Shared regression tests also cover Pocket Mikan.

**v0.7.2:** Shared desktop/Pocket research intent and relevant evidence reuse. Both apps share the desktop-derived entity-aware query builder and source-reuse policy; Windows keeps its Rust compatibility fallback, SearXNG retries, and Ollama model-directed tools for factual questions, while ordinary chat skips unnecessary tool planning. Android keeps Tavily and Gemini Nano. Both clients use the same TypeScript routing policy and cross-platform regression tests.

**v0.7.0:** Manually managed Mikan character canon, with separate About Mikan details, preferences, hobbies and traits kept independent from the user's memories.

**v0.6.2:** Research follow-ups can reuse previously retrieved source excerpts, with clear stale-source labeling. Optional 4K/8K/16K/32K per-request context setting under AI & Models, preserving the Ollama default unless changed. Schedule-specific follow-ups now search for verified dates rather than extrapolating from AI summaries.

**v0.6.1:** Improved search-query extraction for multipart questions and a broader SearXNG retry when research initially returns zero results.

**v0.6.0:** First local SQLite memory layer: persistent conversations and explicitly saved user facts, with a memory inspector and slash commands. Previous v0.5.4 features:  Conversational, explicitly labeled speculation grounded in evidence; continuity across follow-ups and improved inline citation guidance; expanded web-research triggers and recent-album queries; evidence-first search with transparent queries and source excerpts, per-turn Eastern date/time context, stronger search chronology/disambiguation, integrated Docker/SearXNG lifecycle controls, organized Settings tabs (AI, Internet, Appearance), separate personality presets, optional model-directed web tools, safe public HTTPS reader, and on-disk webpage caching.

## Getting started

1. Install Ollama for Windows and download a model (such as `qwen3.5:9b`).
2. Download the newest **successful** Windows installer from [GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/windows.yml).
3. For internet search, follow the [SearXNG Windows setup](tools/searxng/README.md) once. The Docker container is separate from the desktop app.
4. Open Mikan with Ctrl+Alt+M, or use the tray icon. Change model, appearance, and search settings under Settings.

See [SETUP.md](SETUP.md) for shortcuts, slash commands, automatic search and cache limitations. Roadmap: [Trello](https://trello.com/b/bLO0mXJM/ai-desktop-companion).
