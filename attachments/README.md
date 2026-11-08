# Local chat file attachments (Mikan Desktop v0.8.3)

Click the **paperclip** beside the message field or type `/attach`, then choose a file. Mikan extracts readable text or prepares an image **locally**, shows the filename/preview, and sends it to **your Ollama model only after you click Send**. You can remove the pending attachment first.

This is a single-file-per-message implementation (one image *or* one text/document). File selection does not grant folder-wide access.

## Supported formats

- **Text and code:** TXT, Markdown/MDX, CSV/TSV, JSON/JSONL, YAML, XML, HTML, CSS/SCSS, JavaScript/TypeScript, PHP, Python, Rust, Go, Java, Kotlin, C/C++, C#, SQL, shell and PowerShell, TOML, configuration and logs, diff/patch, Vue/Svelte/Astro, SVG (as XML text), and numerous other common source formats.
- **Documents:** PDF (extractable text), DOCX, ODT and PPTX slide text. Images embedded *inside* documents are **not** read. Scanned/image-only PDFs are not OCR'd.
- **Spreadsheets:** XLS, XLSX, XLSM, XLSB, ODS. Sheet names, readable cell values and row structure are extracted as plain tabular text. Charts, formatting and embedded images are not interpreted. Macros are never executed.
- **Images:** PNG, JPG/JPEG, WebP, BMP and GIF, transformed to a still JPEG (animated GIF first frame). The selected Ollama model must report `vision` in `/api/show`.

Legacy binary DOC/PPT, encrypted Office files, audio and video are not supported. Parsing can fail for unusual or corrupt files; tell Mikan what was missing rather than assuming it read the whole file.

## Size and privacy

- The selected file is capped at **12 MB**. Text/code files have a stricter **4 MB** limit.
- Images are resized to no more than 1600×1050 and compressed. Large PDF/Office text is bounded by the extraction service and also by the selected Ollama context window. The pending preview warns when only part can fit.
- No file is written to disk by Mikan's attachment parser; extracted text and image bytes are **not saved** in SQLite, Qdrant or Mem0. Normal question and answer text still appears in conversation history, which can naturally contain details from your file.
- Bytes travel only from the WebView2 file picker to the Tauri process (for binary document extraction) and the selected local Ollama endpoint on `127.0.0.1` / `localhost`. Ordinary text files are decoded in the WebView.
- Uploaded content is **untrusted reference data**, not executable instructions. It cannot override Mikan's tool permissions or system prompt. No background directory indexing, automatic memory ingestion, or autonomous file selection exists.
- To discuss a previously attached file in detail in a new message, reattach it. The assistant's previous answer may remain in chat, but the actual attachment does not.

## Technical implementation

`src/chat-attachments.ts` handles format detection, encoded text, image resizing, bounded context and ephemeral state. `src-tauri/src/file_attachments.rs` extracts PDF/Office/Excel contents using open-source Rust libraries, with file-size and ZIP-entry limits and no file system paths. The existing multimodal Ollama `images` channel handles attached images. `src/App.tsx` owns the picker, preview/removal and user-confirmed send.

The self-knowledge registry includes file-reading and image-attachment capabilities; Windows CI checks the native command and release versions. Future extensions can add multi-attachment messages, per-page PDF references, OCR and durable imported knowledge libraries *with separate opt-in*. Uploading a temporary file is not the same as teaching Mikan permanent knowledge.
