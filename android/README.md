# Pocket Mikan · Shared React Android client (experimental)

This is the same **Mikan project**, not a new persona implementation. The Android client now builds the React frontend from the root repository and reuses:

- `src/personality.ts` and `src/PersonalityControls.tsx` for personality presets/sliders.
- `src/storage.ts` for the typed settings model, defaults and custom portrait storage.
- `src/slash-commands.ts` for command parsing and help definitions.
- `src/CharacterCanonTab.tsx` and `src/memory-client.ts`'s memory record types and user/character context-selection functions.
- `src/components/ChatMarkdown.tsx` for identical safe message markdown in desktop and mobile.
- `src/mobile/MobileApp.tsx` for a touch-first layout based on those shared modules.

The desktop React entry remains unchanged in behavior. `src/main.tsx` switches entrypoints by Vite mode; desktop builds use the existing Tauri entry, mobile builds use `--mode mobile`.

## Install Pocket Mikan

The app uses a **persistent private Android signing key** to support routine
in-place updates. See [SIGNING.md](SIGNING.md) for the required one-time
GitHub Actions secret configuration.

If the run succeeds but **no APK artifact appears**, check the **Prepare persistent private signing** step: the signing secret was missing from that workflow invocation. Trigger a fresh workflow run after saving the secret. A successful compile alone does not mean a signed APK was published.

After signing is configured, use the latest successful GitHub Actions run's
`mikan-pocket-signed-apk` artifact. The package ID is
`dev.capnolithyl.mikan.pocket`.

**One-time reset:** older APKs used random debug signing keys and cannot be
upgraded in place. Uninstall the current app only after confirming you have
nothing to keep. Install a new APK signed with the persistent key. Subsequent
updates can then install directly over it.

## Runtime

- `ReactActivity` is currently a **minimal native Android WebView host** using the secure `WebViewAssetLoader` HTTPS-like local origin and explicit JavaScript bridge to the existing Kotlin `NanoBackend`.
- The app requests **no INTERNET permission** and denies external resource loads. It does not use online inference.
- Mikan's Android model is Gemini Nano through the ML Kit GenAI Prompt API and Android AICore. It may need a first-time system-managed download. The backend streams real output to React. No synthetic replies.
- The keyboard/IME uses Android edge-to-edge insets while CSS maintains the composer at the bottom and hides the portrait while typing.
- v0.2.1: Gemini Nano status is now a small header indicator. To check readiness or download the model, open **Settings → AI → Local model**. If the model isn't ready, chat shows a setup notice that links to Settings. No persistent large Check button on the chat screen.
- The original character-sheet image is not checked into the repository. Use **Change portrait** in the mobile UI to select the desired local PNG; the app stores it in IndexedDB.
- **v0.3.0 SQLite memory parity:** all conversations, messages, user facts and Mikan character canon are now stored in app-private `mikan-memory.sqlite3` using the same table names, constraints and timestamp units as desktop `src-tauri/src/memory.rs`.
- Phone startup performs a one-time, transactional import from the earlier React `localStorage` facts/chats/canon **and** the original Kotlin `ChatStore`. It marks each import complete only after success and clears old React data only after the SQLite bootstrap succeeds.
- The shared `memoryContext()` and `characterContext()` functions still generate distinct user/persona prompt context. The `pocketMemory` adapter uses desktop-compatible TypeScript data types; the actual Android storage implementation is `PocketMemoryStore.kt`.
- **v0.3.1 conversational memory fix:** Natural-language save requests are routed by the React application into SQLite directly, without relying on Gemini Nano to say it saved something. For example, after "My name is Marcus", "You wanna remember that?" resolves the previous *user* declaration and saves "The user's name is Marcus". The reply confirms success **only after** SQLite returns it. "Remember that I love metal" works directly, and "Remember your favorite color is orange" goes into character canon, not user memory. Ambiguous requests ask for details instead of faking a save. Existing /remember and /canon-set still work.
- **High-confidence automatic extraction:** exact, stable self-reports such as "My name is Marcus", "I love metal", and "My favorite color is blue" bypass Nano's often-unreliable JSON formatting and run through the same native evidence/privacy filters and SQLite provenance tables. More complicated facts still use the conservative optional Nano extractor, so missing captures or quota limits remain possible.
- **Automatic memories:** Settings → AI → Memories provides separate user and character capture switches. After a completed, saved reply, Gemini Nano makes a second small extraction request. Native rules (ported from `src-tauri/src/memory_extraction.rs`) reject unsupported evidence, non-stable or sensitive facts, duplicate user facts, and attempts to overwrite Mikan's established character canon. Each accepted item gets an exact source quote and a message reference in SQLite. Processed replies are marked idempotently.
- Personal memories and character canon remain editable and deletable from their own screens. Settings/appearance and custom portrait remain stored locally in WebView storage and IndexedDB; **not everything has moved to SQLite**.
- The model may be unable to return well-formed memory JSON or may hit AICore quotas. Such failures appear in the UI; the chat itself remains usable. This behavior and in-place migration still need on-phone validation.
- Many shared slash commands work, including `/help`, `/settings`, `/personality`, `/preset`, `/randomize`, the personality sliders, appearance changes, `/memories`, `/remember`, `/canon`, `/canon-set`, `/chats`, `/new`, `/log`. Commands requiring Windows tools or internet search explain the limitation rather than pretending to work.

## Architecture and next steps

This is a **working intermediate bridge** to avoid losing the already functional Nano backend while reusing the desktop's real React code. It is *not yet* a Tauri 2 Android package. Tauri 2 remains the desired eventual mobile runtime: replace the Android WebView shell with a Tauri mobile plugin/adaptor for Nano and map its command/event transport to the same frontend contract. Don't assert Tauri integration is complete before actually compiling it.

For future sync, numeric user/character fact IDs remain local database row identifiers. Import/export will need durable cross-device UUIDs and conflict-aware merge semantics. The SQLite schemas match today, but the two installations do not share a live database. A future knowledge/document cache will have its own tables and remain separate from user memories and character canon.

A future secure, opt-in PC mode may connect over Tailscale with authentication, shared memory, and internet search. Never expose Ollama directly to the public internet.

Separate Trello backlog item records the future user-controlled **export → NAS/cloud → import** idea for personas, memories and conversations. There is no sync in the current APK.

## Local build

1. From repository root: `npm install`, then `npm run build:mobile`. The Vite output lands in `android/app/src/main/assets`.
2. Open `android/` in Android Studio (JDK 17 / SDK 35) or run `gradle :app:assembleDebug` there.
3. GitHub Actions performs both steps, validates the shared TypeScript code, runs `PocketMemoryRulesTest` with JUnit, verifies the `.preview` package ID and packages the APK.

## Test checklist for v0.3.0

- The first stable-signed APK requires uninstalling the old randomly signed APK once. Thereafter, install updates directly over Pocket Mikan using the same GitHub Actions signing secret.
- Confirm existing conversations and manual memories survive the in-place update and are visible on reopening.
- Reproduce the reported problem: say "My name is Marcus" (automatic capture should save it) or say "You wanna remember that?" afterward (explicit save must acknowledge only after SQLite success). Check Memory, restart, and ask "What is my name?"
- Save, edit, delete a user fact with `/remember`, `/forget`, and Memory; do the same with Mikan canon using `/canon-set` and `/canon`.
- In Settings, toggle both automatic memory options. Ask Mikan something about herself, then inspect canon; provide a durable first-person fact and inspect user memory. Confirm the two collections never mix.
- Reopen the app; all SQLite memories and conversations should still be present. Try airplane mode after AICore initialization.

No automatic cloud/NAS sync or actual knowledge index yet.

See [Tauri 2 mobile plugin documentation](https://v2.tauri.app/develop/plugins/develop-mobile/) and [ML Kit GenAI Prompt](https://developers.google.com/ml-kit/genai/prompt/android/get-started).
