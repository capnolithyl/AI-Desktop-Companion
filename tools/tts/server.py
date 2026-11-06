"""Optional localhost Qwen3-TTS VoiceDesign service for Mikan.

Run inside a dedicated Python 3.12 venv with qwen-tts and a compatible PyTorch.
Does not run on Mikan startup or load a model until the first speech request.
"""
from __future__ import annotations

import io
import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOST = "127.0.0.1"
PORT = int(os.environ.get("MIKAN_TTS_PORT", "8765"))
MODEL = "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign"
MODEL_LOCK = threading.Lock()
_model = None
_device = None


def synthesize(text: str, prompt: str, language: str) -> bytes:
    global _model, _device
    # Keep model initialization and generation serialized to avoid VRAM spikes.
    with MODEL_LOCK:
        import torch
        import soundfile as sf
        from qwen_tts import Qwen3TTSModel

        if _model is None:
            requested = os.environ.get("MIKAN_TTS_DEVICE", "auto")
            _device = ("cuda:0" if torch.cuda.is_available() else "cpu") if requested == "auto" else requested
            dtype = torch.bfloat16 if _device.startswith("cuda") else torch.float32
            print(f"Loading {MODEL} on {_device} ({dtype})", flush=True)
            _model = Qwen3TTSModel.from_pretrained(
                MODEL,
                device_map=_device,
                dtype=dtype,
                attn_implementation="sdpa",
            )
        wavs, sample_rate = _model.generate_voice_design(
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
        if self.path != "/health":
            return self.json_reply(404, {"error": "Not found"})
        self.json_reply(200, {
            "status": "ok",
            "engine": "qwen3-tts-voice-design",
            "model_loaded": _model is not None,
            "device": _device,
        })

    def do_POST(self) -> None:
        if self.path != "/synthesize":
            return self.json_reply(404, {"error": "Not found"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.json_reply(415, {"error": "Expected application/json"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > 8192:
                return self.json_reply(413, {"error": "Request too large"})
            payload = json.loads(self.rfile.read(size))
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
            self.reply(200, wav, "audio/wav")
        except (ValueError, TypeError, json.JSONDecodeError) as error:
            self.json_reply(400, {"error": str(error)[:200]})
        except Exception as error:
            print(f"Speech failed: {error}", flush=True)
            self.json_reply(503, {"error": "Speech engine failed; check the server console"})

    def log_message(self, fmt: str, *args: object) -> None:
        print("%s %s" % (self.log_date_time_string(), fmt % args), flush=True)


if __name__ == "__main__":
    print(f"Mikan Qwen3-TTS on http://{HOST}:{PORT} (model loads on first request)", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
