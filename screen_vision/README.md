# Mikan Desktop: On-demand screen vision (v0.8.2)

Mikan can analyze **one explicitly approved still image** of a Windows monitor using a locally installed Ollama vision model. This feature does **not** give her an always-on view, continuous recording, OCR pipeline, mouse control, or access to arbitrary files.

## Using it

1. Choose an Ollama model with a `vision` capability. The current model is checked using Ollama's `POST /api/show`; a text-only model cannot analyze screen images. A local vision-capable Qwen model should work if its particular Ollama tag reports vision.
2. In desktop Mikan, click the **camera** beside the message box (or use `/vision`). Select one display if you have multiple monitors.
3. Click **Take screenshot**. Mikan temporarily hides her own window, captures **one** still image, resizes it to at most 1600 × 1050, and compresses it as JPEG. The preview appears in the chat dock.
4. Review the preview. Close confidential tabs/windows *before* capture or remove the preview and retry if something sensitive appears. Type a question such as “What's that error?” or leave the field empty for “What can you see in this screenshot?”
5. Click **Send** to explicitly provide this one image to **local Ollama** alongside the question. Clicking **Remove screenshot** sends nothing.

The image is not uploaded to external websites, automatically indexed into Mem0/Qdrant, saved in SQLite, or kept for later turns. Mikan stores the text of the question and its answer in normal chat history (so replies may still mention on-screen content). If you need the image reexamined in a later turn, capture it again.

No background screenshot timer or screen-monitoring command is registered. The Tauri command exists so Mikan's *UI* can invoke it only when the owner clicks; the language model does not get a tool to invoke it autonomously.

## Technical contract and extension points

- `src-tauri/src/screen_vision.rs`: monitor discovery, one-shot screenshot, temporary overlay hiding, local JPEG encoding, raw image size constraints, Ollama model capability check.
- `src/screen-vision.ts`: ephemeral screenshot types, screen-context guidance and no-image guard.
- `src/App.tsx`: monitor selector, image preview and explicit send; one image is attached only to the **latest user turn** through Ollama's `images` array. Avoids the web-research tool path when attaching screenshots.
- `src/self-knowledge.ts`: `screen-vision` is experimental, not permanently “ready”. Readiness depends on the currently selected local vision-capable model.
- `src/screen-vision.test.mjs`: tests safe prompt behavior, including no false claims of screen access. Native tests reject oversized/malformed/unapproved image attachments.
- Ollama docs: https://docs.ollama.com/capabilities/vision (the REST API accepts base64 image content).
- Capture library: https://github.com/nashaofu/xcap.

Future enhancements can add selectable rectangular regions, window-only capture, reusable image context in memory *with explicit approval*, additional model options, and more comprehensive visual OCR. Keep permission and capture operations out of the LLM tool planner. Image content must remain untrusted input.

## Practical limits

- The GPU must have enough VRAM for the selected vision model and its image tokens; visual processing may be considerably slower than text.
- Very small UI text may be hard to read after compression. Raise/zoom the relevant window or capture a narrower region in a future release.
- Screenshots with personal data should be reviewed. Screen capture is **not** a substitute for deliberate permission for desktop actions.
- Windows screen capture may fail on secure desktops, protected content, games that block capture, or some remote desktop sessions.
