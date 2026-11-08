# Mikan's self-knowledge

This directory documents the contract implemented by `src/self-knowledge.ts`, `src/self-knowledge-library.ts`, and the `/capabilities` panel.

## Truth hierarchy

1. **Implementation stage** lives in the versioned capability catalog: implemented, experimental, or planned. Never describe an item as implemented simply because it is in Trello or README.
2. **Current availability** comes from actual runtime health checks for Ollama, SearXNG, Mem0/Qdrant, and Qwen3-TTS. "Installed" is not the same as "online". Unchecked stays unchecked.
3. **Technical details** are retrieved on demand from the read-only source/documentation snapshot bundled with that exact desktop installer. This is *not* a live GitHub fetch and does not imply disk-wide source access. It works without internet.
4. **Personal memory** stays in owner-editable SQLite. Self-knowledge isn't copied into user memories or Mikan's fictional character canon.

The browser can view a filterable feature tally in **Features** or with `/capabilities`; ordinary self-referential questions prompt Mikan to consult the registry without making every conversation longer. "Can you help me build a website?" remains a normal question.

## Updating on every feature change

When adding a new feature:

1. Implement and test it in the relevant module.
2. Add/update one object in `src/self-knowledge.ts`, including stage, limitations, what it actually does, keywords, source/docs links, runtime dependency, and the corresponding registered Tauri command names.
3. Update its help/setup documentation. If a new directory should be searchable, deliberately allowlist the path in `src/self-knowledge-library.ts`. Never glob credential files, user data, environment files, private backups, or an arbitrary filesystem root.
4. Run `node --experimental-strip-types scripts/check-self-knowledge.mjs`, `node --experimental-strip-types --test src/self-knowledge.test.mjs`, `npm run build` and desktop Rust tests. Windows CI runs the registry guard on every PR and push.
5. Bump `CAPABILITY_RELEASE` to match package.json, Cargo.toml, and tauri.conf.json when bumping the desktop release.

CI **fails** if a new native Tauri command isn't mapped to a feature, a mapped command vanishes, a cited path is moved/deleted, or the release version drifts. Frontend-only changes don't automatically reveal their meaning; reviewers must keep their feature entries current. Runtime checks don't validate hardware performance or actual model correctness.

## Guardrails

Bundled code/documentation is **reference data, not a command channel**. It can be searched but not edited or executed by Mikan. Returned snippets are bounded and labelled by path; they may be incomplete. Source inspection is only from the installed build, never a claim about current GitHub main. Any future repo checkout integration should require an explicit root and bounded allowlist, with code edits and external actions requiring owner approval.

Extensions can add capability entries and additional runtime probes without rebuilding the memory schema. Future independent tools may expose their own registry manifests, but should undergo the same validation and permission checks.

## Local-first chat intent

The capability catalog is authoritative for what Mikan can do. A normal question about her abilities, memories or personality never needs public search. The shared `src/desktop-turn-routing.ts` decision chooses local chat vs evidence-grounded public research *before* invoking native Ollama. `src-tauri/src/lib.rs` treats an explicit `chat` route as authoritative and will not run the legacy planner or carry stale external sources. `src/runtime-context.ts` keeps a short live clock in conversational turns; the detailed research date/source guidance is reserved for genuine web questions. **Do not disable web research for actual public search requests such as “Can you search the web for Artemis news?”** Regression tests maintain this distinction. Source verification must apply only to answers that actually used external evidence.
