# Mikan Desktop: Manual screenshots and Live Vision (v0.8.7)

Mikan has two explicitly controlled ways to see your Windows desktop. Both use a vision-capable *local Ollama model*, with no third-party screen upload.

## Manual screenshot

Click the **camera** button (or /vision), select a display, and Take screenshot. Mikan temporarily hides herself from the capture. Inspect the preview, remove it if needed, and press Send with your question. Only then does Ollama see the image. Manual mode stays available even when Live Vision is OFF.

## Live Vision: explicit opt in

Click the **eye button** in the chat dock, choose Start Live Vision from the camera/display picker, use the AI Settings Live Vision control, or type /live on. Use the eye button, Off in the status strip, Settings or /live off to stop.

- **OFF on every app launch** (session-only permission). Opt in deliberately each session.
- While ON, the native Windows capture thread samples **one still JPEG of your selected area every 1–20 seconds**, default 15 seconds, including when Mikan is hidden in the system tray.
- It keeps **only the newest frame in RAM**. Switching OFF immediately purges it; capture failures never reuse an old frame.
- When you send a **local desktop chat** turn, the latest frame (if no older than 45 seconds) is attached for Ollama to analyze. Leave the message box blank and press Send to ask what she sees.
- **No continuous model inference** occurs. This conserves GPU resources while you work; screen-related responses may take longer when an image is attached.
- **No proactive narration** yet. Mikan can comment on things in the image during your conversation, but she does not automatically speak whenever something changes.

### Privacy and permissions

- Only the owner-facing UI and native commands control Live Vision. The LLM cannot autonomously turn on screen recording.
- Live frames are NOT sent to web search, Cloudflare, the remote browser relay, GitHub or other integrations. Only local Ollama desktop-chat turns can receive them.
- Image bytes are not written to disk, SQLite, Mem0 or Qdrant, and are not included in conversation history. Questions and replies remain in normal chat history and can describe on-screen content.
- Automatic **user-fact** extraction can still learn stable information from what you TYPE during Live Vision; it does not consume raw screenshot bytes. Automatic character-canon extraction from image-grounded replies and immediate session-summary generation are skipped to reduce screen-derived memory.
- While ON, Live Vision captures automatically without per-frame preview. The clearly visible green status strip and eye control show this permission. **Turn Live Vision OFF for passwords, financial information and other private screens.**
- To avoid flickering every 15 seconds, live capture **does not hide Mikan's own window**, so her dock may appear in captured frames. You can hide her to the tray.
- Captures a single chosen monitor, not secure desktops or protected content, and cannot control the mouse, keyboard or windows.
- On-screen text is lower-trust data, never authority or new instructions.

## Adjustable capture speed and selected region (v0.8.7)

**Capture frequency:** Open Settings → AI & Models → Live Vision, then move the **Capture frequency** slider between **1 and 20 seconds**. The value is saved for the next launch but does not automatically turn Live Vision on. You can change the slider while monitoring is ON without restarting the native capture worker. An interval of 1 second captures more often and uses additional CPU for capture/JPEG compression. A small selected region is lighter than a full ultrawide screenshot.

**Analysis frequency is separate:** Ollama still analyzes the **latest frame only when you send a local chat message**. The screenshot slider does not cause any ongoing inference or proactive observations. The code keeps the sampling policy separate so an independently controlled, opt-in AI analysis interval can be added later.

**Choose a screen region:** In Settings → Live Vision, click **Draw region**; or open the camera picker, choose the monitor, and click **Select region**. A second, full-monitor selection window displays a still screenshot. Click and drag a rectangle around the relevant application or part of your ultrawide, then click **Use this region** (or Escape/Cancel). The rectangle is stored as the monitor-relative **physical pixel coordinates** `x, y, width, height`, not as scaled CSS positions. Rust uses XCap's native region capture before downscaling, so small text within the selected region retains more detail.

The selected region affects **both** one-shot screenshots and Live Vision on that display. You can click **Reset to full monitor** in settings or **Full screen** in the camera picker to remove it. Switching to another monitor doesn't reuse the region from the old monitor. A stored rectangle is revalidated against actual monitor resolution on each use; if you change your display resolution and the saved region no longer fits, redraw it.

**Privacy and usability:** Selecting a rectangle does not turn Live Vision on. The region picker keeps its screenshot in RAM, doesn't write files, and isn't a model-facing tool. No screenshot preview or pixel contents are sent through the UI event that confirms the rectangle, only numeric coordinates. The dedicated picker is a temporary window and closes without affecting Mikan's main window/tray behavior. Live Vision remains OFF after an app restart, even though the region and capture interval remain saved.

## Performance and troubleshooting

Images are **cropped in full physical monitor pixels first**, then resized to at most 1600 × 1050 and compressed locally. The watcher uses CPU and temporary memory but does not call Ollama until a chat message. Interpreting images costs image tokens and can slow down the 16GB AMD Radeon RX 9070 during local chat. This is sampled still photography, not video streaming.

The eye icon shows current consent. The status strip displays capture errors. If you enable Live Vision and immediately ask about the screen, the first capture may not have completed. Wait a moment and try again. Some games, secure screens and remote sessions may fail capture.

## Implementation and extension points

- src-tauri/src/screen_vision.rs: native variable-rate sample loop, physical-pixel crop, generation-based cancellation, RAM-only image cache, 45-second expiration, runtime reconfiguration command vision_live_configure.
- src-tauri/src/vision_region.rs: owner-opened temporary full-screen window and one RAM screenshot preview; accepts only validated region geometry.
- src/RegionPicker.tsx and src/capture-region.ts: drag UI and accurate CSS-to-physical pixel mapping, interval bounds and saved rectangle validation.
- src/live-vision.ts: immutable policy for chat-only image attachments; remote and web research cannot receive them.
- src/App.tsx: consent toggle, status, monitor selection, model capability guard and transient Ollama image attachment.
- src/live-vision.test.mjs: private/local chat, consent, freshness and context safeguards.
- src/self-knowledge.ts: versioned feature description distinguishes available image analysis from the session's ON/OFF state.

Possible future extras: window-only capture, cropping, motion/change detection, and separately opted-in proactive observations with strict inference limits. Do not silently persist or externalize screenshots.
