# Mikan Qwen3-TTS voice service

An optional local service. The speech model and Python runtime aren't bundled
with Mikan and must be started on your Windows PC. Nothing is sent to a paid
speech API.

## Create one recognizable Mikan voice

VoiceDesign creates a new speaker for every generation, even with the same
description. For consistent identity, Mikan now supports the official
**VoiceDesign → Base voice cloning** workflow:

1. Generate voices in Qwen3-TTS VoiceDesign until one sounds right.
2. Save your favorite as **mono, 16-bit PCM WAV** between 2 and 30 seconds
   (prefer 5–15 seconds, maximum 6 MB). If your download is MP3, or a stereo/
   floating-point WAV, convert it in a local audio editor.
3. Copy the *exact words spoken* in that recording (up to 2000 characters).
4. Start the local speech service; in **Mikan → Settings → Voice**, select
   **Check connection**, choose your WAV and paste its exact transcript.
5. Click **Save reference**. **Test voice** and all subsequent spoken
   messages now use **Qwen3-TTS Base** with this reference. A reusable
   voice-clone prompt is computed once and cached for subsequent speech.
6. Replace the clip or remove it at any time. Without a reference, synthesis
   falls back to VoiceDesign using your editable descriptive prompt.

The saved reference persists in `%LOCALAPPDATA%\Mikan\voice` as
`mikan-reference.wav` and `mikan-reference.txt`. Override with the
`MIKAN_TTS_DATA_DIR` environment variable if needed. The files remain on
your PC and aren't committed to the repository.

**Model resources:** VoiceDesign and Base are separate 1.7B models. Only one
is loaded at a time to reduce VRAM pressure. Loading a different model
unloads the previous one. First use of Base downloads its weights; the
saved clip is reprocessed once after each service restart. Output delivery
can still vary in rhythm/emotion, but the reference should make the speaker
significantly more consistent.

## Windows 11 quick setup

The AMD Radeon RX 9070 still needs an on-PC test of a supported ROCm /
Windows PyTorch build. The community
[Qwen3-TTS-AMD](https://github.com/trevortai/Qwen3-TTS-AMD) project is
a runtime reference, not a required dependency of this service.

1. Install Python **3.12**. Open PowerShell in `tools/tts`.
2. Create the environment: `py -3.12 -m venv .venv`
3. Activate: `.\.venv\Scripts\Activate.ps1`
4. Install compatible PyTorch from the
   [official selector](https://pytorch.org/get-started/locally/). Confirm
   your AMD GPU/driver/wheel combination for ROCm. A CPU-only smoke test
   works but may take a long time.
5. `pip install -r requirements.txt`. Check pip did not replace your
   working PyTorch build.
6. Start: `python server.py`
7. Check `http://127.0.0.1:8765/health`. It starts without loading
   model weights. The first actual synthesis loads/downloads the model.

Set `MIKAN_TTS_DEVICE=cpu` or `MIKAN_TTS_DEVICE=cuda:0` to override the
automatic selection. ROCm builds commonly use PyTorch's `cuda` interface
for AMD GPUs. Keep Ollama's VRAM usage in mind.

## HTTP API and limitations

- The service listens only on `127.0.0.1` at port `8765` (adjust with
  `MIKAN_TTS_PORT`); Tauri rejects non-local origins.
- `GET /health`: service/model state.
- `GET /reference`: saved voice/transcript/status.
- `POST /reference`: JSON `audio_base64` (PCM16 WAV) and `ref_text`.
- `DELETE /reference`: remove the saved reference.
- `POST /synthesize`: JSON `text`, `voice_prompt`, `language=English`;
  returns WAV. Chooses Base or VoiceDesign automatically.
- The Python service is manual-start, one full utterance at a time, English
  only. No streaming, persistent model process manager, microphone input,
  Android access, or synchronized lip movements yet.
- Stop in Mikan interrupts playback or discards the pending WAV, but does not
  cancel a generation already running in the Python process.

Official documentation and exact clone methods:
https://github.com/QwenLM/Qwen3-TTS
