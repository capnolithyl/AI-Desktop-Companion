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
import wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = int(os.environ.get("MIKAN_TTS_PORT", "8765"))
MODELS = {
    "design": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
    "clone": "Qwen/Qwen3-TTS-12Hz-1.7B-Base",
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


def reference_status() -> dict:
    wav, text_file = reference_paths()
    if not (wav.is_file() and text_file.is_file()):
        return {"configured": False, "transcript": None, "duration_seconds": None}
    transcript = text_file.read_text(encoding="utf-8")
    return {
        "configured": bool(transcript.strip()),
        "transcript": transcript,
        "duration_seconds": round(wav_duration(wav.read_bytes()), 1),
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


def save_reference(audio: bytes, transcript: str) -> dict:
    validate_reference(audio, transcript)
    with MODEL_LOCK:
        wav, text_file = reference_paths()
        wav.parent.mkdir(parents=True, exist_ok=True)
        temp_wav, temp_text = wav.with_suffix(".wav.tmp"), text_file.with_suffix(".txt.tmp")
        try:
            temp_wav.write_bytes(audio)
            temp_text.write_text(transcript.strip(), encoding="utf-8")
            os.replace(temp_wav, wav)
            os.replace(temp_text, text_file)
            clear_prompt_cache()
        finally:
            temp_wav.unlink(missing_ok=True)
            temp_text.unlink(missing_ok=True)
        return reference_status()


def delete_reference() -> dict:
    with MODEL_LOCK:
        wav, text_file = reference_paths()
        wav.unlink(missing_ok=True)
        text_file.unlink(missing_ok=True)
        clear_prompt_cache()
        return reference_status()


def load_model(kind: str):
    global _model, _model_kind, _device
    import torch
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
    _model = Qwen3TTSModel.from_pretrained(
        MODELS[kind],
        device_map=_device,
        dtype=dtype,
        attn_implementation="sdpa",
    )
    _model_kind = kind
    return _model


def synthesize(text: str, prompt: str, language: str) -> bytes:
    with MODEL_LOCK:
        import soundfile as sf
        wav_file, text_file = reference_paths()
        if wav_file.is_file() and text_file.is_file() and text_file.read_text(encoding="utf-8").strip():
            model = load_model("clone")
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
            wavs, sample_rate = model.generate_voice_clone(
                text=text,
                language=language,
                voice_clone_prompt=_clone_prompt,
            )
        else:
            model = load_model("design")
            wavs, sample_rate = model.generate_voice_design(
                text=text,
                language=language,
                instruct=prompt,
            )
        output = io.BytesIO()
        sf.write(output, wavs[0], sample_rate, format="WAV", subtype="PCM_16")
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
                return self.json_reply(200, save_reference(audio, transcript))

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
