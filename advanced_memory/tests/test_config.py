"""Mem0 provider config must never fall back to OpenAI or telemetry."""
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import make_mem0, load_token


class ConfigurationTests(unittest.TestCase):
    def test_config_pins_local_ollama_and_persistent_embedded_qdrant(self):
        seen = {}
        class FakeMemory:
            @staticmethod
            def from_config(config):
                seen["config"] = config
                seen["telemetry"] = os.environ.get("MEM0_TELEMETRY")
                return "injected"
        module = types.ModuleType("mem0")
        module.Memory = FakeMemory
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "config.json").write_text(json.dumps({
                "model": "qwen3.5:9b", "ollamaUrl": "http://127.0.0.1:11434"
            }), encoding="utf-8-sig")
            with patch.dict(sys.modules, {"mem0": module}):
                self.assertEqual(make_mem0(root), "injected")
            config = seen["config"]
            self.assertEqual(seen["telemetry"], "false")
            self.assertEqual(config["llm"]["provider"], "ollama")
            self.assertEqual(config["embedder"]["provider"], "ollama")
            self.assertEqual(config["vector_store"]["provider"], "qdrant")
            self.assertEqual(config["embedder"]["config"]["model"], "nomic-embed-text:latest")
            self.assertEqual(config["vector_store"]["config"]["embedding_model_dims"], 768)
            self.assertIn(str(root), config["vector_store"]["config"]["path"])
            self.assertIn(str(root), config["history_db_path"])

    def test_unsafe_remote_ollama_endpoint_is_rejected_before_mem0_initialization(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "config.json").write_text(json.dumps({
                "model": "qwen3.5:9b", "ollamaUrl": "https://some-cloud-service.example"
            }), encoding="utf-8")
            module = types.ModuleType("mem0")
            module.Memory = object()
            with patch.dict(sys.modules, {"mem0": module}), patch.dict(os.environ, {}, clear=True):
                with self.assertRaisesRegex(ValueError, "local Ollama"):
                    make_mem0(root)

    def test_local_token_is_persistent_and_owner_specific(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            token = load_token(root)
            self.assertEqual(len(token),64)
            self.assertEqual(load_token(root),token)
            self.assertEqual((root / "token").read_text(encoding="utf-8"),token)


if __name__ == "__main__":
    unittest.main()
