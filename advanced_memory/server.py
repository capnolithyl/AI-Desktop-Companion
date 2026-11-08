"""Mem0 OSS semantic index for Mikan's *existing* local SQLite user facts.

The SQLite inspector remains authoritative. Mem0 uses Ollama + embedded Qdrant
to index those facts for semantic retrieval. It must never silently create user
memories from generated assistant text, or erase the conversation archive.
No cloud provider or account is used.
"""
from __future__ import annotations

import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import sys
import threading
from typing import Any

HOST = "127.0.0.1"
PORT = 18764
NAMESPACE = "mikan-curated-user-facts-v1"
MAX_BODY = 300_000


def data_root() -> Path:
    root = os.environ.get("MIKAN_ADVANCED_MEMORY_HOME")
    if root:
        return Path(root).expanduser().resolve()
    return (Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) /
            "Mikan" / "advanced-memory")


def load_token(root: Path) -> str:
    root.mkdir(parents=True, exist_ok=True)
    file = root / "token"
    if file.is_file():
        token = file.read_text(encoding="utf-8").strip()
        if len(token) != 64 or not all(c in "0123456789abcdef" for c in token):
            raise ValueError("Invalid local advanced-memory token")
        return token
    token = secrets.token_hex(32)
    # Exclusive create stops simultaneous startups from overwriting each other.
    try:
        with file.open("x", encoding="utf-8") as handle:
            handle.write(token)
        if os.name != "nt":
            file.chmod(0o600)
        return token
    except FileExistsError:
        return load_token(root)


def make_mem0(root: Path) -> Any:
    from mem0 import Memory  # optional dependency; the base desktop app needs none
    vector_dir = root / "qdrant"
    vector_dir.mkdir(parents=True, exist_ok=True)
    ollama_url = os.environ.get("MIKAN_OLLAMA_URL", "http://127.0.0.1:11434")
    if ollama_url.rstrip("/") not in ("http://localhost:11434", "http://127.0.0.1:11434"):
        raise ValueError("Mem0 may use only the local Ollama server")
    model = os.environ.get("MIKAN_MEMORY_LLM", "qwen3.5:9b")
    if not model or len(model) > 100 or any(ch.isspace() for ch in model):
        raise ValueError("Invalid local Mem0 model")
    config = {
        "vector_store": {
            "provider": "qdrant",
            "config": {
                "collection_name": "mikan_curated_facts_v1",
                "path": str(vector_dir),
                "embedding_model_dims": 768
            },
        },
        "llm": {
            "provider": "ollama",
            "config": {
                "model": model, "temperature": 0,
                "ollama_base_url": ollama_url
            },
        },
        "embedder": {
            "provider": "ollama",
            "config": {
                "model": "nomic-embed-text:latest",
                "ollama_base_url": ollama_url
            },
        },
        "history_db_path": str(root / "mem0-history.db"),
        "version": "v1.1"
    }
    return Memory.from_config(config)


def extract_rows(result: Any) -> list[dict]:
    if isinstance(result, dict):
        value = result.get("results", [])
        return [entry for entry in value if isinstance(entry, dict)] if isinstance(value, list) else []
    return []


def sqlite_id(entry: dict) -> int | None:
    metadata = entry.get("metadata") or {}
    value = (metadata.get("sqlite_id") if isinstance(metadata, dict) else None)
    if value is None:
        value = entry.get("sqlite_id")
    try:
        value = int(value)
        return value if value > 0 else None
    except (TypeError, ValueError):
        return None


class CuratedIndex:
    """Never return a memory not present in the caller's current SQLite facts."""
    def __init__(self, memory: Any):
        self.memory = memory
        self.checksum: str | None = None
        self.mutex = threading.Lock()

    def recall(self, question: str, supplied: list[dict]) -> list[dict]:
        if not isinstance(question, str) or len(question) > 1000:
            raise ValueError("Invalid query")
        if not isinstance(supplied, list) or len(supplied) > 500:
            raise ValueError("Invalid SQLite fact list")
        facts: dict[int, str] = {}
        for item in supplied:
            if not isinstance(item, dict):
                raise ValueError("Malformed SQLite fact")
            ident, fact = item.get("id"), item.get("fact")
            if type(ident) is not int or ident < 1 or not isinstance(fact, str) or not 1 <= len(fact) <= 500:
                raise ValueError("Invalid SQLite fact")
            facts[ident] = fact
        checksum = hashlib.sha256(json.dumps(
            sorted(facts.items()), ensure_ascii=False
        ).encode("utf-8")).hexdigest()

        with self.mutex:
            if checksum != self.checksum:
                existing = extract_rows(self.memory.get_all(
                    filters={"user_id": NAMESPACE}, top_k=1200))
                by_id = {key: item for item in existing
                         if (key := sqlite_id(item)) is not None}
                # Add and update using actual Mem0 OSS calls, not a homebrew
                # embedding implementation. "infer=False" prevents a second
                # model from paraphrasing a curated user-approved fact.
                for ident, fact in facts.items():
                    prior = by_id.get(ident)
                    if prior is None:
                        self.memory.add(fact, user_id=NAMESPACE, infer=False,
                                        metadata={"sqlite_id": str(ident)})
                    elif prior.get("memory") != fact:
                        self.memory.update(prior["id"], text=fact)
                for ident, prior in by_id.items():
                    if ident not in facts:
                        self.memory.delete(prior["id"])
                self.checksum = checksum

            if not question.strip() or not facts:
                return []
            rows = extract_rows(self.memory.search(
                question, filters={"user_id": NAMESPACE}, top_k=10))
            result = []
            seen = set()
            for entry in rows:
                ident = sqlite_id(entry)
                if ident not in facts or ident in seen:
                    continue
                seen.add(ident)
                score = entry.get("score")
                result.append({
                    "id": ident,
                    "fact": facts[ident],  # SQLite is the single source of truth.
                    "score": float(score) if isinstance(score, (int, float)) else None
                })
                if len(result) >= 8:
                    break
            return result


class Handler(BaseHTTPRequestHandler):
    server_version = "MikanMem0/1"

    def log_message(self, format: str, *args: Any) -> None:
        pass  # never print personal facts or bearer token to server logs

    def respond(self, status: int, result: dict) -> None:
        body = json.dumps(result, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if self.path == "/health":
            self.respond(200, {"status": "ready", "provider": "mem0-oss-local"})
        else:
            self.respond(404, {"error": "Not found"})

    def do_POST(self) -> None:
        if self.path != "/recall":
            return self.respond(404, {"error": "Not found"})
        # A browser cannot send authenticated JSON cross-origin without CORS
        # preflight; additionally require a random owner-local bearer token.
        if not secrets.compare_digest(self.headers.get("X-Mikan-Token", ""),
                                      self.server.mikan_token):
            return self.respond(403, {"error": "Unauthorized"})
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            return self.respond(415, {"error": "JSON required"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= MAX_BODY:
                return self.respond(413, {"error": "Invalid request size"})
            payload = json.loads(self.rfile.read(size))
            if not isinstance(payload, dict):
                raise ValueError("Invalid JSON object")
            result = self.server.mikan_index.recall(payload.get("query"), payload.get("facts"))
            self.respond(200, {"matches": result})
        except (ValueError, TypeError, json.JSONDecodeError):
            self.respond(400, {"error": "Invalid memory request"})
        except Exception:
            # Do not accidentally leak the local-memory content to callers.
            self.respond(503, {"error": "Local memory index unavailable"})


def main() -> None:
    root = data_root()
    token = load_token(root)
    memory = make_mem0(root)
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.mikan_token = token
    server.mikan_index = CuratedIndex(memory)
    print(f"Mikan Mem0 local service listening on {HOST}:{PORT}", flush=True)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
        if hasattr(memory, "close"):
            memory.close()


if __name__ == "__main__":
    main()
