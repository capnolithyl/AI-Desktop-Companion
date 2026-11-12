# Mikan stabilization

Stabilization branch: `stabilization/local-tools-memory-v1` · draft PR #77.
This branch is deliberately not merged until automated checks and a Windows smoke test pass.

## Changes in this first pass

- Saved user facts have a local SQLite FTS5 index, including migration, update and delete synchronization. The vector service remains optional.
- Personal recall merges lexical and good semantic matches deterministically rather than waiting for a separate model reranking pass.
- Existing explicit web, Notion, identity-memory and privacy routing remains in place.
- Local tool calls validate their inputs and bound returned content before adding it to the model context.
- A local reasoning setting (Fast / Auto / Deep) controls thinking for known capable models, with simple chat retaining fast replies.
- Ollama defaults to 16K context for new/unspecified settings; a deliberate “Ollama default” choice remains available.
- Auto-memory extraction checks older topic-matched facts as well as recent records to reduce semantic duplicates.

## CI and local checks

The GitHub Windows and Android workflows must pass before merging. The automated tests do not prove that real local inference, Notion or voice behaves correctly.

On the owner's Windows PC:
1. Install the draft PR's Windows artifact only after CI succeeds and keep the existing installer available for rollback.
2. Confirm chat streams, tray/hotkey, avatar reactions, Pocket TTS and OpenRouter fallback still work.
3. Test explicit SearXNG search and page reading; then ask a time-sensitive question without explicit search.
4. Check memory recall with and without the Mem0 sidecar; update or delete a fact and verify search no longer finds the old text.
5. Ask about a cached Notion chapter, then test full scene reading.
6. Try Fast, Auto and Deep reasoning on Qwen3.5; compare speed and answer quality.
7. Confirm Pocket Mikan connects and exchanges messages.

Optional synthetic Ollama evaluation (never sends personal facts or calls a real web search):

```powershell
npm run eval:local -- --model qwen3.5:9b --out eval-report.json
```

The harness sends harmless example prompts to localhost Ollama and checks tool-call decisions and elementary reasoning in both thinking modes. It does not execute any tool calls. A failure is diagnostic, not proof that a model is unusable.

## Remaining roadmap, intentionally not rushed

- Durable SQLite extraction job queue, superseding old facts, human-reviewed memory reconciliation, and scoped project memories.
- Capability discovery for arbitrary Ollama models and full real-model benchmarks on the RX 9070.
- Cloud privacy policy for personal/Notion context, modularizing the large chat component, tightening CSP.
- Reproducible dependency lockfiles and removing vendored Python helper dependencies from Git history/tracked tree.

No existing chats, saved facts, character canon, Notion data or voice settings are intentionally deleted by this pass.
