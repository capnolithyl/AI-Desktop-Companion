## Pocket Mikan v0.4.9: Memory-first personal questions

Pocket now routes self-referential questions to phone-local SQLite rather than Tavily. It waits for any in-flight automatic memory extraction to finish, then reads fresh saved facts before preparing Nano's prompt. The web research cache is not reused for personal questions, so "How old am I?" never searches public age-calculator websites. When a saved birth date exists, the app calculates age deterministically using the phone's local calendar date, including birthday boundaries and time zones; if not saved, it explains the missing fact rather than guessing. Broader questions such as "Where do I work?" and "What do you remember about me?" stay local and use saved facts with explicit instructions not to invent personal details. This is a reusable, privacy-preserving memory-first route rather than a special-purpose web search exception.

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


## Independent web research (Pocket Mikan v0.4.8)

**v0.4.8:** Fact-based source verification is now shared with desktop v0.7.5. Nano's draft answer is screened against actual citation numbers, titles, years and release-type evidence; unsupported claims are omitted, or the app states it cannot verify the answer. Factual drafts no longer stream visibly before verification. Search snippets are 500 characters per selected source. Android AICore explicitly blocks background generation, so an interrupted response is stored in SQLite with a retryable state and a **Retry answer** control; a retry reuses the same user turn and any previously fetched Tavily evidence without duplicate messages or unnecessary web calls. This does not enable prohibited background Nano inference.

## Independent web research (Pocket Mikan v0.4.7)

**v0.4.7:** Shared conversation context engine from desktop v0.7.4, inspired by SillyTavern's bounded dialogue and LlamaIndex's condense-plus-context. A lightweight Gemini Nano-only rewrite resolves ambiguous follow-up searches (e.g. "When did that album come out?") against the latest user-established subject; only the resolved public query is sent to Tavily. Prior sourced assistant replies stay in the small dialogue context as unverified conversation, not trusted facts. Ordinary chat skips the extra model pass. **Automatic local memory remains on in regular conversations when Settings → Auto Remember User is enabled (the default).** After Mikan asks a personal question, a short answer without "I"/"my" is eligible for Nano memory extraction. Native SQLite checks the answer's verbatim evidence; no command or special learning phrase is required. The dedicated v0.4.6 learning mode remains optional, not required.

## Independent web research (Pocket Mikan v0.4.6)

**v0.4.6:** Opt-in conversational learning. After the user asks Mikan to learn about them by asking questions and remembering answers, short responses are interpreted using Mikan's immediately preceding question, not just isolated first-person grammar. Supported across arbitrary topics, with normalized structured facts when safe and a grounded question/answer fallback otherwise. New memories are written and verified in local SQLite *before* any confirmation; this works even when automatic memory capture is turned off. Mikan can continue asking new questions and the user can say "Stop learning my answers" to end the session. Direct "Remember that?" after a question/answer now also resolves the context. Sensitive content and uncertain answers are not saved automatically; all saved facts remain inspectable, editable, and deletable in Memory.



**v0.4.5:** Every Gemini Nano prompt receives live local date/time and timezone from the Android device. The Tavily evidence prompt uses the phone's local calendar date, not the UTC date (which is often tomorrow after early evening in Michigan). Simple "What date is it?" and "What time is it?" requests are answered directly from the local clock, without web searches, stale citations or Nano-generated recaps. Additional instructions prioritize the new question rather than repeating old band facts. Tests cover a UTC-midnight crossover, DST, local time requests, and temporal source handling.



**v0.4.4:** Web research follow-ups such as "Any info on a potential release date, a title, or singles?" now inherit user-established topics, search for the newly requested details, and must avoid inventing specifics absent from sources. The source link list in chat is collapsed by default; tap Sources to expand. Shared routing tests cover both Windows and Android.



**v0.4.3 shared research policy:** Pocket and desktop now import the exact same `src/research-routing.ts` for search-versus-chat decisions and `src/research-context.ts` for source follow-ups, with shared tests. The desktop-derived query builder is now shared TypeScript; Windows retains its Rust compatibility fallback, SearXNG retry and Ollama planner while Pocket uses Tavily and Gemini Nano. Only app-specific adapters remain separate. No syncing, new subscriptions, or model changes required.



**v0.4.2:** Fixed the Pixel regression where "Can you find me the latest info on [band]?" never reached Tavily because "me" was incorrectly classified as sensitive personal context. Research routing now recognizes generic requests to find information *for* the user, while keeping personal data local by default. Added tests for the actual Shadows Fall prompt and varied public/private cases. Generic "latest news" searches are no longer hard-limited to the past month, which had excluded older but still most recent album announcements. If automatic search is disabled, Pocket Mikan will not silently guess answers to time-sensitive questions.



**v0.4.1:** Search only on real research requests, not conversational statements such as "You have internet access now." Cached evidence carries into immediately relevant factual follow-ups only. Casual chat omits old sourced assistant text and unsupported citation markers; the chat auto-scrolls as answers and source links stream in unless you scroll up yourself.


Pocket Mikan can search the internet without connecting to your Windows PC:

1. Create a personal **free Researcher** account at https://app.tavily.com/ (currently 1,000 free API credits/month, no credit card required; confirm at https://www.tavily.com/pricing).
2. Copy your Tavily API key from the dashboard. **Never paste it into GitHub, Trello, chat logs, screenshots or a committed settings file.**
3. Install the same-signer v0.4.0 Android APK over your existing Pocket Mikan installation; do **not** uninstall or clear its data.
4. Open **Settings → Internet**, paste the key in the password field, then tap **Save key**. The key is encrypted with a device-bound Android Keystore AES-GCM secret and stored privately in native Android preferences, never in React/localStorage settings or the WebView.
5. Leave **Search automatically** enabled for news, current facts and explicit research requests. Ask "What's the latest news about Artemis?" or use **/search**. For public HTTPS pages, use **/read https://example.org/page**. Source links open in your normal browser.
6. **Remove key** in Settings deletes the saved credential. The internet permission enables only the native pinned HTTPS Tavily client; bundled WebView assets cannot fetch arbitrary websites. Gemini Nano chat, conversations and SQLite memories stay on your phone.

The app reuses shared desktop WebResult types, compact source-grounding rules from src/web-search.ts, contextual follow-up evidence from src/research-context.ts, and a portable deterministic router (src/research-routing.ts) reflecting the existing Rust desktop research intent. The Docker/SearXNG desktop implementation is unchanged.

The client calls only https://api.tavily.com/search (basic depth, up to five results) and, when asked to read a URL, https://api.tavily.com/extract. Search queries/URLs and provider metadata are transmitted to Tavily; personal chat and local memories are not sent. Free provider quotas and Wi-Fi/cellular connectivity apply. Search output is untrusted data, never model instructions. Answers should cite sources, distinguish dates and state uncertainty. For follow-up questions the app stores source references in SQLite message metadata. Real provider calls require the user's key; CI verifies compilation and offline tests.

## Runtime

- `ReactActivity` is currently a **minimal native Android WebView host** using the secure `WebViewAssetLoader` HTTPS-like local origin and explicit JavaScript bridge to the existing Kotlin `NanoBackend`.
- The app requests INTERNET permission for the native HTTPS Tavily search/extract adapter only; WebView external requests remain blocked. Gemini Nano inference stays local.
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
