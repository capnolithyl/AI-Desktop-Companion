# Advanced memory: Mem0 OSS on Windows

This is a direct integration of Mem0 OSS 2.2.1, local Ollama and persistent Qdrant. No hosted API key, cloud account or subscription. Mem0's default PostHog telemetry is disabled before import.

## How it works

Mikan's **SQLite user facts remain the only authority**. The conversation archive and Mikan's character canon stay separate. Mem0 creates a secondary vector index of facts already present in the desktop memory inspector. A question like "Help me build a website" can retrieve your WordPress experience even without a literal word match.

The Rust bridge checks that returned fact IDs AND their text still match current SQLite records before adding them to Mikan's prompt. An edit or deletion in SQLite is synchronized to Mem0. No historic conversation is deleted. This release does NOT let Mem0 silently create new facts with inference: the existing evidence-grounded automatic memory extractor still writes to SQLite. We will benchmark Mem0's own inference before deciding whether to switch extraction providers.

## Windows first-time setup

Install free Python 3.11 including the py launcher, and start the existing local Ollama. Open PowerShell in the Mikan project root and run:

    powershell -ExecutionPolicy Bypass -File .\scripts\setup-advanced-memory.ps1

This creates a separate virtual environment under %LOCALAPPDATA%\Mikan\advanced-memory, installs pinned Mem0 OSS, downloads Ollama nomic-embed-text, and starts the local service.

If using a different Ollama chat model, add the -Model parameter, e.g. -Model "qwen3.5:9b". The model name is saved to the local config for later restarts. The setup script is also included in the desktop installer's advanced-memory resources directory.

When the service has been installed, Mikan will start it on later app launches if it isn't already running. A service Mikan started will stop when quitting from Mikan's tray menu. Manually started services are left under owner control.

Open Settings -> AI & Models -> Advanced personal memory and check for "Ready". If missing, the regular SQLite-based chat still works.

## Local components

- Mem0 OSS v2.2.1; local Qdrant vectors in the advanced-memory/qdrant folder.
- Ollama nomic-embed-text:latest for 768-dimensional embeddings.
- The existing Ollama inference server. No remote LLM is configured.
- The local HTTP bridge at 127.0.0.1:18764, protected by a random token in the owner's LocalAppData.
- Mem0 revision history in advanced-memory/mem0-history.db.
- Main personal memories and all conversation messages retained in Mikan's existing SQLite archive.

No remote fact processing; Mem0 anonymous telemetry explicitly disabled. Initial dependency/model downloads do need internet. The app does not automatically install anything.

## Performance and limitations

On an RX 9070 with 16 GB VRAM, the embedding model can compete with the chat LLM; benchmark latency and Ollama unload behavior. The initial vector index rebuild after a bulk import can take considerably longer, but synchronization now happens in a daemon worker and does not block chat. During indexing or when Mem0 is offline, Mikan still ranks SQLite facts locally using content, categories, tags and pins. Mem0 indexes the extra labels as search hints while returning only the unchanged, authoritative SQLite fact to the model.

This is a meaningful direct Mem0 integration, not a guarantee of near-perfect memory. Date-aware changes of current project, explicit supersession, full conversation summaries, and archived FTS5 remain separate work. The service deliberately uses existing SQLite facts instead of creating a second memory truth source. Before enabling Mem0 inference to write memories, compare its actual accuracy and editing behavior with our native extractor.
