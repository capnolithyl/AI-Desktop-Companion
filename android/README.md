# Pocket Mikan · Android proof of concept

A standalone Android chat experiment that **does not need the Windows PC**.
It lives in `android/` so the Tauri desktop app and its Windows-specific
commands are untouched.

## First build

GitHub Actions → **Android Pocket APK** → latest successful run →
**mikan-pocket-debug-apk** artifact. Download and extract the artifact, then
install `app-debug.apk` on an Android phone (allow sideloading for your
browser or file manager). This is a debug-signed test package, not a release.

Or open the `android/` directory in Android Studio (JDK 17 / SDK 35) and run
the `app` configuration.

## How it works

- Uses ML Kit GenAI Prompt API and Android AICore's **Gemini Nano**.
- On supported phones, check model status; if offered, tap **Download** while
  online once. After the initial setup, inference occurs on device.
- Text chat with streaming, a lightweight Mikan personality, and up to the
  last 200 turns saved locally in app-private preferences.
- A bundled stylized Mikan illustration is shown above chat. Tap **Change Portrait**
  or the image to pick your original character PNG from Android's file picker.
  The image is copied to app-private storage and restored on subsequent launches.
- When the keyboard opens, the portrait hides to give chat room, and the
  composer stays above the keyboard; hiding the keyboard restores the portrait.
- No app `INTERNET` permission, account, analytics, cloud conversation backup,
  or connection to the desktop. Model readiness and downloading are handled
  by Android's AICore service, not our app.
- The `ChatBackend` interface is the future seam for a secured PC-connected
  backend, plus explicit sync. Conversation/turn IDs already exist for this.
- Gemini Nano is a *different, smaller* model than the PC's Ollama model.
  It has a small context window and Android-enforced battery/usage quotas.
  This is experimental and response quality will differ from desktop Mikan.

## Scope and limitations

Only locally stored chat, not full memory/character canon synchronization,
voice, screen vision, web search or PC connectivity. The bundled illustration
is not the original character-sheet artwork; import the original PNG from the
phone if you want the exact portrait. No fake replies: if AICore is unavailable
or returns an error, the app shows it.

The architecture intentionally favors a quick functional phone test over
reimplementing Tauri's Windows-oriented tray/window runtime. If we later
want shared React UI, we can keep the backend and data contracts while
replacing the UI. Nothing in this POC changes the desktop app.

Docs:
- https://developers.google.com/ml-kit/genai/prompt/android/get-started
- https://developers.google.com/ml-kit/genai (supported devices / quotas)
