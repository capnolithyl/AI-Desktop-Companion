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
- **v0.3.6 save confirmation:** A brief, auto-dismissing confirmation toast appears after a verified SQLite memory write. Automatic extraction reports counts of saved user facts vs Mikan character details, and displays nothing when the extractor skips a turn or finds only duplicates. Explicit `/remember`/conversation saves and manual edits get the same understated feedback. The toast does not block chat or require dismissal.
- **v0.3.5 generalized memory + CRUD fix:** Android now uses a conservative grammar-based detector for stable first-person facts (not a fixed list of names or interests), handling self-introductions, birthdays, occupations, professions, ongoing work/languages, favorites, preferences and other `my ... is ...` declarations. Each candidate is grounded in its source quote and validated before SQLite saves it; multiple facts in a single turn are supported. Ambiguous statements still use Gemini Nano extraction and may be skipped. Sensitive content and temporary moods are excluded.
- **v0.3.5 native bridge repair:** Android's transport request ID and database record ID previously shared the field `id`. Edit/delete overwrote the request ID so the JS Promise could never receive the native reply. CRUD now sends `recordId` separately, with the transport ID protected. SQLite mutations are checked transactions, stale automatic provenance is cleared, and the UI refreshes from SQLite after each change. A verified status or error is shown instead of optimistic success. Node tests cover bridge request/response matching, Kotlin tests cover diverse stable facts and negative examples.
- **v0.3.4 natural introduction memory fix:** The automatic native extractor and the shared React explicit-memory resolver recognize stable self-introductions in conversational forms, such as `Hi I'm Marcus`, `Hello, my name is Alex`, `I’m Sam`, `You can call me Jo`, and `I go by Ana`. These normalize to one `The user is named ...` record and preserve source evidence. Questions like `Can you remember that?` can now resolve the preceding user introduction and only confirm after SQLite actually saves it. Short-lived moods (`I'm tired`) and vague greetings are excluded from deterministic name capture. More complex automatic memories still depend on Nano and may be skipped.
- **v0.3.3 built-in portrait:** Mikan's supplied adult orange-tabby character portrait is bundled as optimized transparent WebP at `src/mobile/assets/mikan-portrait.webp`, packaged into the APK by Vite. No import required on a fresh installation and no network calls. The chat screen shows only her portrait, without an image picker overlay. In **Settings → Appearance**, a current portrait preview provides **Choose image** and, for custom portraits, **Reset to default**. Custom portraits remain in IndexedDB and take priority over the bundled default until reset. The `/portrait` command opens Settings instead of invoking a picker over chat.
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

## Test checklist for v0.3.6

- The first stable-signed APK requires uninstalling the old randomly signed APK once. Thereafter, install updates directly over Pocket Mikan using the same GitHub Actions signing secret.
- Confirm existing conversations and manual memories survive the in-place update and are visible on reopening.
- In a fresh chat, tell Mikan a new, stable fact. Confirm the brief **Remembered: 1 about you** notice appears only after it is saved. Repeat an existing fact or say something non-memorable: no automatic success notice should appear. Test a manual Save/edit and ensure its confirmation disappears on its own.
- Verify Memory CRUD on an existing automatically saved record: choose **Edit**, change text, save, leave and return to the Memory screen, and restart the app. The edit should remain. Choose **Delete**, confirm, then restart and verify the record is gone. A native error must be visible instead of silently hanging.
- Verify additional automatic facts: try `My birthday is April 23 1992`, `I'm a WordPress developer`, and `I work as a developer` in new messages. Check SQLite Memory after the reply. The exact wording is not a hardcoded personal profile: the generic patterns also work with other dates, jobs, interests and subjects.
- Test the exact regression: in a new chat say `Hi I'm Marcus` and let Mikan finish responding. Under Memory check for `The user is named Marcus`. In another new chat say `Hi I'm Alex`, then `Can you remember that?`; it must confirm a SQLite save, not ask what to remember. Check it survives closing/reopening. These are examples; the parser also handles other names and common introductory phrases.
- Verify Mikan's new default portrait appears without importing an image and there is no Change button or clickable portrait in chat. In Settings → Appearance, choose a custom image, reopen the app to verify persistence, then **Reset to default** and confirm the bundled artwork returns after restarting.
- Reproduce the reported problem: say "My name is Marcus" (automatic capture should save it) or say "You wanna remember that?" afterward (explicit save must acknowledge only after SQLite success). Check Memory, restart, and ask "What is my name?"
- Save, edit, delete a user fact with `/remember`, `/forget`, and Memory; do the same with Mikan canon using `/canon-set` and `/canon`.
- In Settings, toggle both automatic memory options. Ask Mikan something about herself, then inspect canon; provide a durable first-person fact and inspect user memory. Confirm the two collections never mix.
- Reopen the app; all SQLite memories and conversations should still be present. Try airplane mode after AICore initialization.

No automatic cloud/NAS sync or actual knowledge index yet.

See [Tauri 2 mobile plugin documentation](https://v2.tauri.app/develop/plugins/develop-mobile/) and [ML Kit GenAI Prompt](https://developers.google.com/ml-kit/genai/prompt/android/get-started).
