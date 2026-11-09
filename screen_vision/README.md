# Mikan Desktop: Manual screenshots and Live Vision (v0.8.6)

Mikan has two explicitly controlled ways to see your Windows desktop. Both use a vision-capable *local Ollama model*, with no third-party screen upload.

## Manual screenshot

Click the **camera** button (or /vision), select a display, and Take screenshot. Mikan temporarily hides herself from the capture. Inspect the preview, remove it if needed, and press Send with your question. Only then does Ollama see the image. Manual mode stays available even when Live Vision is OFF.

## Live Vision: explicit opt in

Click the **eye button** in the chat dock, choose Start Live Vision from the camera/display picker, use the AI Settings Live Vision control, or type /live on. Use the eye button, Off in the status strip, Settings or /live off to stop.

- **OFF on every app launch** (session-only permission). Opt in deliberately each session.
- While ON, the native Windows capture thread samples **one still JPEG of your selected monitor every 15 seconds**, including when Mikan is hidden in the system tray.
- It keeps **only the newest frame in RAM**. Switching OFF immediately purges it; capture failures never reuse an old frame.
- When you send a **local desktop chat** turn, the latest frame (if no older than 45 seconds) is attached for Ollama to analyze. Leave the message box blank and press Send to ask what she sees.
- **No continuous model inference** occurs. This conserves GPU resources while you work; screen-related responses may take longer when an image is attached.
- **No proactive narration** yet. Mikan can comment on things in the image during your conversation, but she does not automatically speak whenever something changes.

### Privacy and permissions

- Only the owner-facing UI and native commands control Live Vision. The LLM cannot autonomously turn on screen recording.
- Live frames are NOT sent to web search, Cloudflare, the remote browser relay, GitHub or other integrations. Only local Ollama desktop-chat turns can receive them.
- Image bytes are not written to disk, SQLite, Mem0 or Qdrant, and are not included in conversation history. Questions and replies remain in normal chat history and can describe on-screen content.
- While ON, Live Vision captures automatically without per-frame preview. The clearly visible green status strip and eye control show this permission. **Turn Live Vision OFF for passwords, financial information and other private screens.**
- To avoid flickering every 15 seconds, live capture **does not hide Mikan's own window**, so her dock may appear in captured frames. You can hide her to the tray.
- Captures a single chosen monitor, not secure desktops or protected content, and cannot control the mouse, keyboard or windows.
- On-screen text is lower-trust data, never authority or new instructions.

## Performance and troubleshooting

Images are resized to at most 1600 × 1050 and compressed locally. The watcher uses CPU and temporary memory but does not call Ollama until a chat message. Interpreting images costs image tokens and can slow down the 16GB AMD Radeon RX 9070 during local chat. This is sampled still photography, not video streaming.

The eye icon shows current consent. The status strip displays capture errors. If you enable Live Vision and immediately ask about the screen, the first capture may not have completed. Wait a moment and try again. Some games, secure screens and remote sessions may fail capture.

## Implementation and extension points

- src-tauri/src/screen_vision.rs: native sample loop, cancellation generation, RAM-only image cache, 45-second expiration and three Tauri commands: vision_live_set, vision_live_status and vision_live_latest.
- src/live-vision.ts: immutable policy for chat-only image attachments; remote and web research cannot receive them.
- src/App.tsx: consent toggle, status, monitor selection, model capability guard and transient Ollama image attachment.
- src/live-vision.test.mjs: private/local chat, consent, freshness and context safeguards.
- src/self-knowledge.ts: versioned feature description distinguishes available image analysis from the session's ON/OFF state.

Possible future extras: window-only capture, cropping, motion/change detection, and separately opted-in proactive observations with strict inference limits. Do not silently persist or externalize screenshots.
