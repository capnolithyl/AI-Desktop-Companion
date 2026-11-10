"""Local, optional Qwen3-TTS service with VoiceDesign and reusable Base voice cloning.

A saved reference WAV + exact transcript switches subsequent speech to Base cloning.
PyTorch/model weights are loaded lazily; no GPU is needed to register a reference.
"""
from __future__ import annotations

import base64
import binascii
import gc
import io
import json
import os
import threading
import time
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("MIKAN_TTS_PORT", "8765"))
CLONE_SIZE = os.environ.get("MIKAN_TTS_CLONE_SIZE", "1.7B")
if CLONE_SIZE not in ("1.7B", "0.6B"):
    raise ValueError("MIKAN_TTS_CLONE_SIZE must be 1.7B or 0.6B")
MODELS = {
    "design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "clone": f"Qwen/Qwen3-TTS-12Hz-{CLONE_SIZE}-Base",
}
MAX_REFERENCE_BYTES = 6 * 1024 * 1024
MAX_REQUEST_BYTES = 8 * 1024 * 1024 + 8192

MODEL_LOCK = threading.Lock()
_model = None
_model_kind: str | None = None
_device: str | None = None
_clone_prompt = None
_clone_key: tuple[int, str] | None = None


def reference_paths() -> tuple[Path, Path]:
    custom = os.environ.get("MIKAN_TTS_DATA_DIR")
    if custom:
        folder = Path(custom).expanduser()
    else:
        folder = Path(os.environ.get("LOCALAPPDATA") or (Path.home() / ".local" / "share")) / "Mikan" / "voice"
    return folder / "mikan-reference.wav", folder / "mikan-reference.txt"


def reference_name_path() -> Path:
    return reference_paths()[0].with_name("mikan-reference-name.txt")


def valid_reference_name(name: str) -> bool:
    return (1 <= len(name) <= 255 and name.lower().endswith(".wav")
            and not any(char in name for char in ("/", "\\\\"))
            and not any(ord(char) < 32 or ord(char) == 127 for char in name)
            and name not in (".", ".."))


def reference_status() -> dict:
    wav, text_file = reference_paths()
    if not (wav.is_file() and text_file.is_file()):
        return {"configured": False, "transcript": None, "duration_seconds": None, "file_name": None}
    transcript = text_file.read_text(encoding="utf-8")
    try:
        saved_name = reference_name_path().read_text(encoding="utf-8")
    except OSError:
        saved_name = ""
    return {
        "configured": bool(transcript.strip()),
        "transcript": transcript,
        "duration_seconds": round(wav_duration(wav.read_bytes()), 1),
        "file_name": saved_name if valid_reference_name(saved_name) else "mikan-reference.wav",
    }


def wav_duration(data: bytes) -> float:
    if len(data) < 44 or not data.startswith(b"RIFF") or data[8:12] != b"WAVE":
        raise ValueError("Please select a WAV recording.")
    try:
        with wave.open(io.BytesIO(data), "rb") as source:
            if source.getnchannels() != 1 or source.getsampwidth() != 2:
                raise ValueError("Reference must be mono, 16-bit PCM WAV.")
            rate = source.getframerate()
            if not (8000 <= rate <= 96000):
                raise ValueError("Unsupported reference sample rate.")
            return source.getnframes() / rate
    except (wave.Error, EOFError, OSError) as error:
        raise ValueError("Invalid PCM WAV recording.") from error


def validate_reference(audio: bytes, transcript: str) -> float:
    if not (44 <= len(audio) <= MAX_REFERENCE_BYTES):
        raise ValueError("Reference WAV must be under 6 MB.")
    if not (1 <= len(transcript.strip()) <= 2000):
        raise ValueError("Enter the exact spoken transcript (1–2000 characters).")
    duration = wav_duration(audio)
    if not (2.0 <= duration <= 30.0):
        raise ValueError("Reference speech should be 2–30 seconds long.")
    return duration


def clear_prompt_cache() -> None:
    global _clone_prompt, _clone_key
    _clone_prompt = None
    _clone_key = None


def save_reference(audio: bytes, transcript: str, file_name: str = "mikan-reference.wav") -> dict:
    validate_reference(audio, transcript)
    if not valid_reference_name(file_name):
        raise ValueError("Invalid WAV reference filename.")
    with MODEL_LOCK:
        wav, text_file = reference_paths()
        wav.parent.mkdir(parents=True, exist_ok=True)
        name_file = reference_name_path()
        temp_wav, temp_text = wav.with_suffix(".wav.tmp"), text_file.with_suffix(".txt.tmp")
        temp_name = name_file.with_suffix(".txt.tmp")
        try:
            temp_wav.write_bytes(audio)
            temp_text.write_text(transcript.strip(), encoding="utf-8")
            temp_name.write_text(file_name, encoding="utf-8")
            os.replace(temp_wav, wav)
            os.replace(temp_text, text_file)
            os.replace(temp_name, name_file)
            clear_prompt_cache()
        finally:
            temp_wav.unlink(missing_ok=True)
            temp_text.unlink(missing_ok=True)
            temp_name.unlink(missing_ok=True)
        return reference_status()


def delete_reference() -> dict:
    with MODEL_LOCK:
        wav, text_file = reference_paths()
        wav.unlink(missing_ok=True)
        text_file.unlink(missing_ok=True)
        reference_name_path().unlink(missing_ok=True)
        clear_prompt_cache()
        return reference_status()


def miopen_workaround_enabled() -> bool:
    """Read an opt-in, per-Mikan setting; never change global ROCm configuration."""
    override = os.environ.get("MIKAN_TTS_DISABLE_MIOPEN")
    if override is not None:
        return override.strip().lower() in ("1", "true", "yes")
    try:
        config_path = reference_paths()[0].parent / "service.json"
        config = json.loads(config_path.read_text(encoding="utf-8-sig"))
        return config.get("disableMiopen") is True
    except (OSError, ValueError, TypeError, AttributeError):
        return False


def configure_torch_backend(torch) -> None:
    """Experimental Windows ROCm workaround for very slow MIOpen Conv1d decode."""
    if (miopen_workaround_enabled()
            and getattr(torch.version, "hip", None)
            and torch.cuda.is_available()):
        # PyTorch exposes MIOpen through torch.backends.cudnn on ROCm.
        # Scope this to the local TTS process; do not touch the user's wheel.
        torch.backends.cudnn.enabled = False
        torch.backends.cudnn.benchmark = False
        print("[tts] Experimental AMD fallback enabled: bypass MIOpen convolutions", flush=True)


def load_model(kind: str):
    global _model, _model_kind, _device
    import torch
    configure_torch_backend(torch)
    from qwen_tts import Qwen3TTSModel

    if _model is not None and _model_kind == kind:
        return _model
    if _model is not None:
        _model = None
        _model_kind = None
        clear_prompt_cache()
        gc.collect()
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

    requested = os.environ.get("MIKAN_TTS_DEVICE", "auto")
    _device = ("cuda:0" if torch.cuda.is_available() else "cpu") if requested == "auto" else requested
    dtype = torch.bfloat16 if _device.startswith("cuda") else torch.float32
    print(f"Loading {MODELS[kind]} on {_device} ({dtype})", flush=True)
    loading_started = time.perf_counter()
    _model = Qwen3TTSModel.from_pretrained(
        MODELS[kind],
        device_map=_device,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    _model_kind = kind
    print(f"[tts] model loading: {(time.perf_counter() - loading_started)*1000:.0f} ms", flush=True)
    return _model


def synthesize(text: str, prompt: str, language: str) -> bytes:
    queued = time.perf_counter()
    with MODEL_LOCK:
        started = time.perf_counter()
        import soundfile as sf
        wav_file, text_file = reference_paths()
        cloned = wav_file.is_file() and text_file.is_file() and bool(text_file.read_text(encoding="utf-8").strip())
        model = load_model("clone" if cloned else "design")
        loaded = time.perf_counter()
        if cloned:
            transcript = text_file.read_text(encoding="utf-8").strip()
            key = (wav_file.stat().st_mtime_ns, transcript)
            global _clone_prompt, _clone_key
            if _clone_prompt is None or _clone_key != key:
                _clone_prompt = model.create_voice_clone_prompt(
                    ref_audio=str(wav_file),
                    ref_text=transcript,
                    x_vector_only_mode=False,
                )
                _clone_key = key
            prompted = time.perf_counter()
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=_clone_prompt,
            )
        else:
            prompted = time.perf_counter()
            wavs, sample_rate = model.generate_voice_design(
                text=text,
                language=language,
                instruct=prompt,
            )
        generated = time.perf_counter()
        output = io.BytesIO()
        sf.write(output, wavs[0], sample_rate, format="WAV", subtype="PCM_16")
        finished = time.perf_counter()
        print(
            f"[tts] mode={'clone' if cloned else 'design'} chars={len(text)} "
            f"audio_s={len(wavs[0])/sample_rate:.1f} "
            f"queue_ms={(started-queued)*1000:.0f} load_ms={(loaded-started)*1000:.0f} "
            f"reference_ms={(prompted-loaded)*1000:.0f} "
            f"generate_ms={(generated-prompted)*1000:.0f} "
            f"wav_ms={(finished-generated)*1000:.0f} total_ms={(finished-queued)*1000:.0f}",
            flush=True,
        )
        return output.getvalue()

class Handler(BaseHTTPRequestHandler):
    def reply(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def json_reply(self, status: int, data: dict) -> None:
        self.reply(status, json.dumps(data).encode("utf-8"), "application/json")

    def do_GET(self) -> None:
        if self.path == "/health":
            return self.json_reply(200, {
                "status": "ok",
                "engine": "qwen3-tts",
                "model_loaded": _model is not None,
                "model_kind": _model_kind,
                "device": _device,
                "reference_ready": reference_paths()[0].is_file() and reference_paths()[1].is_file(),
            })
        if self.path == "/reference":
            try:
                return self.json_reply(200, reference_status())
            except (OSError, ValueError) as error:
                return self.json_reply(503, {"error": str(error)[:200]})
        return self.json_reply(404, {"error": "Not found"})

    def do_DELETE(self) -> None:
        if self.path != "/reference":
            return self.json_reply(404, {"error": "Not found"})
        try:
            return self.json_reply(200, delete_reference())
        except OSError:
            return self.json_reply(503, {"error": "Could not delete reference; check server console"})

    def do_POST(self) -> None:
        if self.path not in ("/synthesize", "/reference"):
            return self.json_reply(404, {"error": "Not found"})
        if self.headers.get("Content-Type", "").split(";")[0].strip().lower() != "application/json":
            return self.json_reply(415, {"error": "Expected application/json"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            limit = MAX_REQUEST_BYTES if self.path == "/reference" else 8192
            if size < 2 or size > limit:
                return self.json_reply(413, {"error": "Request too large"})
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                return self.json_reply(400, {"error": "Expected a JSON object"})
            if self.path == "/reference":
                encoded = payload.get("audio_base64")
                transcript = payload.get("ref_text")
                if not isinstance(encoded, str) or not isinstance(transcript, str):
                    return self.json_reply(400, {"error": "Reference WAV and transcript are required"})
                if len(encoded) > (MAX_REFERENCE_BYTES * 4 // 3 + 8):
                    return self.json_reply(413, {"error": "Reference WAV is too large"})
                try:
                    audio = base64.b64decode(encoded, validate=True)
                except (binascii.Error, ValueError):
                    return self.json_reply(400, {"error": "Invalid base64 audio"})
                return self.json_reply(200, save_reference(audio, transcript, payload.get("file_name", "mikan-reference.wav")))

            text = payload.get("text", "")
            prompt = payload.get("voice_prompt", "")
            language = payload.get("language", "English")
            if not isinstance(text, str) or not (1 <= len(text.strip()) <= 900):
                return self.json_reply(400, {"error": "Speech text must contain 1-900 characters"})
            if not isinstance(prompt, str) or not (1 <= len(prompt.strip()) <= 650):
                return self.json_reply(400, {"error": "Voice prompt must contain 1-650 characters"})
            if language != "English":
                return self.json_reply(400, {"error": "First version supports English speech"})
            wav = synthesize(text.strip(), prompt.strip(), language)
            return self.reply(200, wav, "audio/wav")
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            return self.json_reply(400, {"error": str(error)[:200]})
        except Exception as error:
            print(f"Voice service failed: {error}", flush=True)
            return self.json_reply(503, {"error": "Voice service failed; check the server console"})

    def log_message(self, fmt: str, *args: object) -> None:
        print("%s %s" % (self.log_date_time_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"Mikan Qwen3-TTS on http://{HOST}:{PORT} (model loads on first speech)", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
