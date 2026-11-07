"""Test local saved reference API and synthesis routing without PyTorch or a GPU."""
import base64
import http.client
import io
import json
import os
import tempfile
import threading
import unittest
import wave
from http.server import ThreadingHTTPServer
from unittest.mock import patch

import server


def make_wav(seconds=3, channels=1):
    out = io.BytesIO()
    with wave.open(out, "wb") as f:
        f.setnchannels(channels)
        f.setsampwidth(2)
        f.setframerate(16000)
        f.writeframes(b"\x00\x00" * 16000 * seconds * channels)
    return out.getvalue()


class ReferenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.worker = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.worker.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.worker.join(timeout=5)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.env = patch.dict(os.environ, {"MIKAN_TTS_DATA_DIR": self.tmp.name})
        self.env.start()
        server.clear_prompt_cache()

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()
        server.clear_prompt_cache()

    def request(self, method, path, data=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.httpd.server_port, timeout=10)
        body = json.dumps(data) if data is not None else None
        headers = {"Content-Type": "application/json"} if data is not None else {}
        connection.request(method, path, body=body, headers=headers)
        response = connection.getresponse()
        status, data = response.status, json.loads(response.read().decode("utf-8"))
        connection.close()
        return status, data

    def test_save_read_delete(self):
        self.assertFalse(self.request("GET", "/reference")[1]["configured"])
        audio = base64.b64encode(make_wav()).decode("ascii")
        status, saved = self.request("POST", "/reference", {
            "audio_base64": audio, "ref_text": "Hi! I'm Mikan."
        })
        self.assertEqual(status, 200)
        self.assertTrue(saved["configured"])
        self.assertEqual(saved["duration_seconds"], 3)
        self.assertEqual(saved["transcript"], "Hi! I'm Mikan.")
        self.assertTrue(self.request("GET", "/health")[1]["reference_ready"])
        self.assertEqual(self.request("GET", "/reference")[1]["transcript"], "Hi! I'm Mikan.")
        self.assertTrue(server.reference_paths()[0].exists())
        status, result = self.request("DELETE", "/reference")
        self.assertEqual((status, result["configured"]), (200, False))
        self.assertFalse(server.reference_paths()[0].exists())

    def test_bad_audio_rejected(self):
        for audio, transcript in [
            (b"garbage", "Hey"),
            (make_wav(1), "Hey"),
            (make_wav(3, channels=2), "Hey"),
            (make_wav(3), ""),
        ]:
            status, _ = self.request("POST", "/reference", {
                "audio_base64": base64.b64encode(audio).decode("ascii"),
                "ref_text": transcript,
            })
            self.assertEqual(status, 400)
            self.assertFalse(server.reference_paths()[0].exists())

    def test_invalid_encoding_rejected(self):
        code, _ = self.request("POST", "/reference", {
            "audio_base64": "bad%%%", "ref_text": "Hey",
        })
        self.assertEqual(code, 400)

    def test_model_routing_and_prompt_cache(self):
        class FakeModel:
            clone_calls = 0
            design_calls = 0
            prompt_calls = 0

            def generate_voice_design(self, **kwargs):
                self.design_calls += 1
                return [[0.0]], 16000

            def create_voice_clone_prompt(self, **kwargs):
                self.prompt_calls += 1
                self.ref_text = kwargs["ref_text"]
                return ["cached prompt"]

            def generate_voice_clone(self, **kwargs):
                self.clone_calls += 1
                self.last_prompt = kwargs["voice_clone_prompt"]
                return [[0.0]], 16000

        fake = FakeModel()
        class FakeSoundfile:
            @staticmethod
            def write(output, wav, rate, **kwargs):
                output.write(make_wav())

        with patch.dict("sys.modules", {"soundfile": FakeSoundfile}), patch.object(server, "load_model", return_value=fake) as loader:
            server.synthesize("Hi!", "Cute and warm", "English")
            self.assertEqual(loader.call_args.args, ("design",))
            self.assertEqual(fake.design_calls, 1)
            server.save_reference(make_wav(), "Hi! I'm Mikan.")
            server.synthesize("Hello again!", "ignored", "English")
            server.synthesize("How's it going?", "ignored", "English")
            self.assertEqual(loader.call_args.args, ("clone",))
            self.assertEqual(fake.clone_calls, 2)
            self.assertEqual(fake.prompt_calls, 1)
            self.assertEqual(fake.last_prompt, ["cached prompt"])
            server.save_reference(make_wav(), "An updated reference.")
            server.synthesize("New reference", "ignored", "English")
            self.assertEqual(fake.prompt_calls, 2)


if __name__ == "__main__":
    unittest.main()
