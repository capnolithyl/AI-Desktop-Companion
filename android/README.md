# Pocket Mikan · Shared React Android client (experimental)

This is the same **Mikan project**, not a new persona implementation. The Android client now builds the React frontend from the root repository and reuses:

- `src/personality.ts` and `src/PersonalityControls.tsx` for personality presets/sliders.
- `src/storage.ts` for the typed settings model, defaults and custom portrait storage.
- `src/slash-commands.ts` for command parsing and help definitions.
- `src/CharacterCanonTab.tsx` and `src/memory-client.ts`'s context-selection functions for manual local memories/canon.
- `src/components/ChatMarkdown.tsx` for identical safe message markdown in desktop and mobile.
- `src/mobile/MobileApp.tsx` for a touch-first layout based on those shared modules.

The desktop React entry remains unchanged in behavior. `src/main.tsx` switches entrypoints by Vite mode; desktop builds use the existing Tauri entry, mobile builds use `--mode mobile`.

## Install test APK

Go to [Android Pocket APK GitHub Actions](https://github.com/capnolithyl/AI-Desktop-Companion/actions/workflows/android.yml), choose the newest **successful** build, download the `mikan-pocket-debug-apk` artifact, extract it and install `app-debug.apk`.

Note: GitHub-hosted debug APKs may be signed with different ephemeral debug certificates. Updating an earlier APK may require uninstalling the previous debug build, which **deletes its local data**. Don't uninstall before saving anything you care about. A persistent signing identity is a future improvement.

## Runtime

- `ReactActivity` is currently a **minimal native Android WebView host** using the secure `WebViewAssetLoader` HTTPS-like local origin and explicit JavaScript bridge to the existing Kotlin `NanoBackend`.
- The app requests **no INTERNET permission** and denies external resource loads. It does not use online inference.
- Mikan's Android model is Gemini Nano through the ML Kit GenAI Prompt API and Android AICore. It may need a first-time system-managed download. The backend streams real output to React. No synthetic replies.
- The keyboard/IME uses Android edge-to-edge insets while CSS maintains the composer at the bottom and hides the portrait while typing.
- v0.2.1: Gemini Nano status is now a small header indicator. To check readiness or download the model, open **Settings → AI → Local model**. If the model isn't ready, chat shows a setup notice that links to Settings. No persistent large Check button on the chat screen.
- The original character-sheet image is not checked into the repository. Use **Change portrait** in the mobile UI to select the desired local PNG; the app stores it in IndexedDB.
- Chat, settings, saved facts and character canon stay on the phone, using browser-local storage. User facts and character canon are separate. Automatic memory extraction is **not** active.
- Many shared slash commands work, including `/help`, `/settings`, `/personality`, `/preset`, `/randomize`, the personality sliders, appearance changes, `/memories`, `/remember`, `/canon`, `/canon-set`, `/chats`, `/new`, `/log`. Commands requiring Windows tools or internet search explain the limitation rather than pretending to work.

## Architecture and next steps

This is a **working intermediate bridge** to avoid losing the already functional Nano backend while reusing the desktop's real React code. It is *not yet* a Tauri 2 Android package. Tauri 2 remains the desired eventual mobile runtime: replace the Android WebView shell with a Tauri mobile plugin/adaptor for Nano and map its command/event transport to the same frontend contract. Don't assert Tauri integration is complete before actually compiling it.

A future secure, opt-in PC mode may connect over Tailscale with authentication, shared memory, and internet search. Never expose Ollama directly to the public internet.

Separate Trello backlog item records the future user-controlled **export → NAS/cloud → import** idea for personas, memories and conversations. There is no sync in the current APK.

## Local build

1. From repository root: `npm install`, then `npm run build:mobile`. The Vite output lands in `android/app/src/main/assets`.
2. Open `android/` in Android Studio (JDK 17 / SDK 35) or run `gradle :app:assembleDebug` there.
3. GitHub Actions performs both steps, validates the shared TypeScript code and packages the APK.

See [Tauri 2 mobile plugin documentation](https://v2.tauri.app/develop/plugins/develop-mobile/) and [ML Kit GenAI Prompt](https://developers.google.com/ml-kit/genai/prompt/android/get-started).
