# Mikan voice prototype: Qwen3-TTS (local)

This is an **optional manual-start** TTS service, not a bundled model or a background task.
Mikan's Voice tab talks to this server through the Rust localhost bridge. Nothing
is uploaded to a speech API. First synthesis downloads model weights unless cached.

## Windows 11 quick setup

This is the first integration checkpoint. On the RX 9070, choose a compatible
PyTorch ROCm/AMD setup before installing the Python requirements. The
community [Qwen3-TTS-AMD](https://github.com/trevortai/Qwen3-TTS-AMD)
project reports RDNA4/Windows support and is a useful **runtime reference**,
but its install and API are independent of this script. Do not assume an
NVIDIA CUDA-only PyTorch wheel can use an AMD GPU.

1. Install Python **3.12**, and open PowerShell in this `tools/tts` folder.
2. Create a venv: `py -3.12 -m venv .venv`
3. Activate it: `.\.venv\Scripts\Activate.ps1`
4. Install a compatible PyTorch build for your CPU/GPU. For a CPU-only
   smoke test you can follow the official [PyTorch install selector](https://pytorch.org/get-started/locally/).
   For Windows AMD ROCm, verify the exact supported driver, wheel, and GPU
   combination first. A PyTorch build that falls back to CPU will be slow.
5. Run `pip install -r requirements.txt` (check that pip did not replace your
   working PyTorch build).
6. Start the service: `python server.py`
7. Check `http://127.0.0.1:8765/health`. It reports the service as available
   before loading the model. **First speech may take much longer** while the
   VoiceDesign model is downloaded and loaded.
8. In Mikan, choose **Settings → Voice**, press **Check connection**, and
   then use the speaker icon beside her reply or the **Test voice** button.

Set `MIKAN_TTS_DEVICE=cpu` or `MIKAN_TTS_DEVICE=cuda:0` before launching
to override auto-detection. ROCm commonly uses PyTorch's `cuda` device
interface even on AMD cards. Keep Ollama's VRAM usage in mind.

The server binds only to `127.0.0.1`; Mikan rejects non-local voice endpoints.
Only English synthesis is wired in this MVP. The voice description is editable;
the default aims for a lower, warm anime-inspired voice rather than a squeak.

## MVP limitations and next steps

- Manual-start Python service, one entire utterance at a time, no streaming.
- The server keeps the VoiceDesign model loaded after the first request.
  Closing the server frees its resources. Mikan does not launch it automatically.
- No stable voice-clone reference yet: VoiceDesign may vary between utterances.
  Later add a saved reference audio and Base-model clone path once we select a
  Mikan voice we like.
- Play/stop works immediately in the UI. Stopping pending synthesis discards
  the reply but does not terminate a running Python inference job.
- Installers do not include the Python runtime or multi-GB model weights.

Upstream model: https://github.com/QwenLM/Qwen3-TTS
