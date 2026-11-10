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


## Automatic start with Mikan (recommended)

If you already got Qwen3-TTS speaking once on this Windows PC, **keep that exact
Python environment**. Do not reinstall PyTorch or rerun the ROCm setup.

1. Open PowerShell in the **Mikan repository root** (the folder containing
   `tools/tts/.venv/Scripts/python.exe`).
2. Run once:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-voice-autostart.ps1
   ```

3. Quit Mikan **from the tray menu**, close any manually started
   `python server.py` console, and reopen Mikan **v0.8.10 or newer**.
4. Open **Settings → Voice → Check connection**. The local endpoint remains
   `http://127.0.0.1:8765`. The first test sentence loads the model;
   simply checking the health endpoint does not load GPU weights.

The one-time script stores only absolute Python/server paths and optional
model/device settings in `%LOCALAPPDATA%\Mikan\voice\service.json`. The
reference recording and transcript already under the voice folder are
**preserved**. Mikan launches the existing venv hidden when Mikan starts,
stops only the instance she launched when quitting from the tray, and tries
to recover if the managed server quits unexpectedly on the next voice request.
Manually started servers are never killed or duplicated. She doesn't need
to run at Windows login; voice comes up when you open Mikan.

The launcher writes small diagnostic messages to
`%LOCALAPPDATA%\Mikan\voice\tts-service.log` (rotated on startup above
5 MiB). For a different voice size, register with
`-CloneSize "0.6B"`; for a forced ROCm device, use `-Device "cuda:0"`.
The default is auto/1.7B. **Rerun the setup script after moving your
checkout or virtual environment.** Uninstalling Mikan does not alter your
Python venv or saved reference.

If you're still on Mikan v0.8.9, startup is manual:

```powershell
cd .\tools\tts
& ".\.venv\Scripts\python.exe" server.py
```


## Progressive Pocket conversation speech (v0.8.14)

Turn on **Settings > Voice > Speak new replies automatically** and
**Start speaking as Mikan types**. Pocket uses the first completed sentence
(typically under 180 characters), then batches longer follow-up passages
(typically under 420 characters) with the next passage prefetched while
the previous WAV is playing. This works concurrently with Ollama's GPU
token generation, because Pocket runs on CPU.

The initial spoken word still must wait for Ollama to produce a complete
sentence, plus Pocket synthesis. This is *not* waveform-level streaming:
the Tauri bridge collects each complete WAV before playing it, and gaps
can still happen if subsequent synthesis is slower than playback. For
no-gap packet-level audio, we'd need a dedicated streaming PCM playback
path (and a continuous output stream), which is a separate experiment.
Long finalized messages are split into chunks under 900 characters,
rather than losing all speech after an 800-character cutoff. The
speaker button still lets you read any existing reply with the whole
text.

As before, source-verified web research, screenshots and attachments
wait for finalized text so unverified generated claims are not spoken
prematurely. Turn the progressive toggle off to restore completion-first
speech if you prefer longer natural passages over responsiveness.

## Optional Pocket TTS CPU engine (Mikan v0.8.12)

This is an independent **audition**, not a replacement for the working
Qwen3-TTS/ROCm environment. Pocket TTS uses your i7 CPU and the same saved
`%LOCALAPPDATA%\\Mikan\\voice\\mikan-reference.wav` voice clip; its
text/audio architecture is different, so **it may not reproduce the Qwen clone
exactly**. Hear the generated sample before switching Mikan.

1. Open https://huggingface.co/kyutai/pocket-tts and accept the model access
   conditions using your own Hugging Face account. Voice-cloning weights are
   access-controlled. Keep your token private; do not commit it.
2. From the Mikan repository root run:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\\scripts\\setup-pocket-tts.ps1
   ```
   This downloads Kyutai's pinned `v4.0.1` Windows x64 portable executable
   (the included Rust binary is named `3.3.0`) and verifies GitHub's
   published SHA256 before extraction to
   `%LOCALAPPDATA%\\Mikan\\voice\\pocket-tts`. It then attempts to
   create `%LOCALAPPDATA%\\Mikan\\voice\\pocket-mikan-sample.wav`
   by cloning the saved voice. **First run includes model download and load.**
   If it fails due to model access, accept the terms and rerun with
   `-PromptForHfToken`: the script asks for your free Hugging Face read token
   without echoing it or saving it to disk, and removes it from the process
   environment after the test. You can alternatively use `hf auth login`
   or a temporary `HF_TOKEN` in the same shell. The script
   registers the app backend only after a successful sample is generated.
   It does **not** touch the Qwen Python venv, torch, drivers, Ollama or persona.
3. Play the WAV to judge timbre, then install/start Mikan v0.8.12 and choose
   **Settings > Voice > Speech engine > Pocket TTS · CPU**. Save settings and
   click **Check connection**. Mikan starts the registered Pocket server on
   127.0.0.1:8766 on demand and saves its local diagnostics to
   `%LOCALAPPDATA%\\Mikan\\voice\\pocket-service.log`.
4. Test the voice on one normal chat reply and compare first speech, pauses,
   clarity, and Ollama tokens/s with the previous Qwen results. Pocket generates bounded
   requests (up to 650 spoken characters per finalized passage) without
   omitting the tail of long replies. With progressive speech enabled,
   it starts with a complete early sentence, followed by longer prefetched
   passages. The Tauri bridge still waits for each complete HTTP WAV
   before playing it. The Pocket engine itself supports
   streamed WAVs, but **sample-level playback is not yet exposed in Mikan**.

### Automatic Pocket authentication (v0.8.13)

The official Pocket standalone Rust executable may require `HF_TOKEN_PATH`
pointing to the login file saved by Python's `huggingface_hub.login()`, even
when the user has already downloaded the model. In v0.8.12, that path could
be available to a manual PowerShell server but not to an independently
launched desktop app, causing `/health` to be unreachable.

Mikan v0.8.13 detects an existing user-scoped token file from the registered
`hfTokenPath` (if present), the inherited `HF_TOKEN_PATH`, `HF_HOME/token`,
or `%USERPROFILE%\\.cache\\huggingface\\token` and passes
`HF_TOKEN_PATH` *only to the Pocket child*. The token **contents are never
copied into Mikan's configuration, logs, or GitHub**. Existing v0.8.12
`pocket-service.json` registrations work without rerunning setup.

If you already successfully started Pocket manually with:

```powershell
$env:HF_TOKEN_PATH = & ".\\tools\\tts\\.venv\\Scripts\\python.exe" -c "from huggingface_hub.constants import HF_TOKEN_PATH; print(HF_TOKEN_PATH)"
```

you can quit that manual Pocket process, quit Mikan from the tray, install
v0.8.13, reopen Mikan and select **Check connection**. No need to regenerate
the WAV. Future setup runs can register the absolute token file path only.

For a non-default `HF_TOKEN_PATH` that isn't in the usual cache, log in
persistently and run the setup script again once to register the path.

### Change Pocket's cloned voice from Mikan settings

After the **one-time** Pocket setup above, no terminal and no Qwen GPU model
are needed to change the recording.

The **Saved voice identity** panel also shows the source WAV filename of the
currently saved recording. The actual stored audio stays at
`mikan-reference.wav`, while the original filename is retained as local
metadata. Older references display the stored filename until replaced.

1. In **Settings → Voice**, select **Pocket TTS · CPU** and click **Check
   connection** if needed.
2. Choose another WAV recording in **Saved voice identity** (prefer a clean
   5–15 second clip, under 6 MB). Its transcript is optional for Pocket.
3. Click **Replace reference**, then **Test voice** to audition it. Repeat with
   as many recordings as you like.

Mikan writes the WAV to `%LOCALAPPDATA%\Mikan\voice\mikan-reference.wav`,
stops **only the Pocket server started by Mikan**, and reconnects to start
it with the new speaker. The first reply may take longer as the CPU model
reinitializes. If you manually started a Pocket server on port 8766, stop
that process first; Mikan won't terminate it or falsely claim a voice
change took effect.

Pocket clones using the WAV alone. If you leave the optional transcript
blank, Mikan removes the previous transcript rather than pairing it with
unrelated audio. Qwen3-TTS still requires an exact matching transcript
when its cloning mode is used. Both engines share the same reference WAV;
switching engines back to Qwen is still possible, provided the required
transcript is saved.

The saved Qwen/ROCm setup, Pocket executable and Hugging Face credentials are
untouched. Pocket's sample and binary remain local to your account.

Upstream: https://github.com/kyutai-labs/pocket-tts,
https://kyutai-labs.github.io/pocket-tts/CLI%20Commands/serve/.

## Progressive conversation speech (v0.8.11)

With **Speak new replies automatically** enabled, **Start speaking as Mikan types**
lets Mikan start synthesizing a short complete clause from local Ollama's text
stream instead of waiting until the whole answer finishes. Later clauses are
queued in order and the next WAV is generated while the previous one plays.
Stop speech and Stop generation both cancel queued segments, though a GPU
request already running in Python continues until it finishes.

This is **not** waveform-level audio streaming. The official `Qwen3TTSModel`
Base cloning method returns complete WAV arrays. First-audio latency depends
on how quickly Ollama generates a speakable phrase and the local GPU generates
that phrase. 2–5 seconds is a goal, not guaranteed on the RX 9070. The opt-in
works for ordinary local chat; source-verified research, screenshots,
attachments and remote-browser responses still wait for the final text.
If stream text differs from the finalized reply, Mikan cancels speculative
speech and plays the corrected reply instead. Generated speech still uses the
saved reference WAV and the ROCm MIOpen workaround configured earlier.

The toggle can be disabled to restore finalized-answer speech. Preloading
and true codec-level streaming remain future investigation areas. Streaming
may increase GPU contention while Ollama is generating.

## HTTP API and limitations

- The service listens only on `127.0.0.1` at port `8765` (adjust with
  `MIKAN_TTS_PORT`); Tauri rejects non-local origins.
- `GET /health`: service/model state.
- `GET /reference`: saved voice/transcript/status.
- `POST /reference`: JSON `audio_base64` (PCM16 WAV) and `ref_text`.
- `DELETE /reference`: remove the saved reference.
- `POST /synthesize`: JSON `text`, `voice_prompt`, `language=English`;
  returns WAV. Chooses Base or VoiceDesign automatically.
- The service can be started and recovered by Mikan after one-time registration; otherwise it remains manual-start. It still generates one complete WAV per request.
  Mikan now splits longer replies into short WAV chunks and prefetches the next
  one while playing the current one. This is not true sample-level streaming.
  No microphone, Android support, or synchronized lip movements yet.
- Stop in Mikan interrupts playback or discards the pending WAV, but does not
  cancel a generation already running in the Python process.

Official documentation and exact clone methods:
https://github.com/QwenLM/Qwen3-TTS

## Experimental Windows AMD MIOpen convolution workaround

If an RX 9070 on Windows ROCm generates a 7–8 second cloned utterance in
roughly two minutes even with a warm model, the bottleneck may be MIOpen
convolution selection rather than model loading or VRAM. PyTorch exposes the
MIOpen backend as `torch.backends.cudnn` on HIP. Some Qwen3-TTS users report
faster generation when this backend is disabled, but this has **not** yet been
benchmarked on Mikan's target RX 9070; it could be slower or fail.

To test **without reinstalling anything** (and without changing the native
desktop executable), stop a manually started server, quit Mikan from its tray,
and run from the current Mikan repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\setup-voice-autostart.ps1 -CloneSize "0.6B" -DisableMiopen
```

Launch Mikan v0.8.10 or newer, test speech once, and check
`%LOCALAPPDATA%\Mikan\voice\tts-service.log` for the
`[tts] Experimental AMD fallback enabled` line followed by a
`[tts] mode=clone ... generate_ms=...` timing. The configuration applies to
both auto-started and manually launched Mikan voice servers. It changes only
the TTS process, not system-wide PyTorch/ROCm, the voice reference, or Mem0.

To revert the experiment, quit Mikan and rerun the same setup command **without**
`-DisableMiopen`; reopen Mikan. Keep `-CloneSize "0.6B"` if you want
to preserve the current benchmark model selection. A previously running
server must be restarted for the flag change to take effect.

Upstream context:
- https://github.com/pytorch/pytorch/issues/150168
- https://github.com/ROCm/TheRock/issues/3077
- https://github.com/ROCm/rocm-libraries/issues/4071

## Debug and benchmark latency

Each chunk prints a [tts] console line measuring queue, model load,
reference preparation, generation, WAV writing and total time. The client
also logs per-chunk request times in the WebView console. No conversation
text is logged.

Default voice cloning stays on 1.7B. To benchmark 0.6B Base, stop the
Python server and restart it with:

```powershell
$env:MIKAN_TTS_CLONE_SIZE = "0.6B"
& ".\.venv\Scripts\python.exe" server.py
```

The 0.6B weights download on first use; the saved voice reference is unchanged.
Set the variable back to "1.7B" to restore the original cloning model.
Don't install NVIDIA-only FlashAttention wheels on the RX 9070.

Git now ignores Python virtual environments and generated cache files.
