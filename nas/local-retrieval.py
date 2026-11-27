"""Private persistent local CPU inference. Never log or store input text."""
import base64
import json
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer
from flashrank import Ranker, RerankRequest

ROOT = "/opt/mikan-embeddings"
EMBED = "BAAI/bge-small-en-v1.5"
RANK = "ms-marco-MiniLM-L-12-v2"

def texts(value):
    if not isinstance(value, list) or not 1 <= len(value) <= 128:
        raise ValueError("invalid batch")
    if any(not isinstance(t, str) or not t.strip() or len(t) > 32000 for t in value):
        raise ValueError("invalid text")
    return value

class Models:
    def __init__(self):
        self.tokenizer = Tokenizer.from_file(ROOT + "/tokenizer.json")
        self.tokenizer.enable_truncation(max_length=192)
        self.tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
        options = ort.SessionOptions()
        options.intra_op_num_threads = 2
        options.inter_op_num_threads = 1
        options.enable_cpu_mem_arena = False
        self.embedding = ort.InferenceSession(ROOT + "/model.onnx", sess_options=options, providers=["CPUExecutionProvider"])
        self.names = {i.name for i in self.embedding.get_inputs()}
        self.ranker = Ranker(model_name=RANK, cache_dir="/opt/mikan-reranker", max_length=128)
        self.stats = {k: {"requests": 0, "items": 0, "lastMs": None} for k in ("embeddings", "rerank")}

    def embed(self, items):
        # Generic embedding API does not identify query vs document. Identical
        # preprocessing for every item, independent of batch order and size.
        vectors = []
        for start in range(0, len(items), 8):
            enc = self.tokenizer.encode_batch(items[start:start + 8])
            inputs = {
                "input_ids": np.array([e.ids for e in enc], dtype=np.int64),
                "attention_mask": np.array([e.attention_mask for e in enc], dtype=np.int64),
                "token_type_ids": np.array([e.type_ids for e in enc], dtype=np.int64),
            }
            hidden = self.embedding.run(None, {k: v for k, v in inputs.items() if k in self.names})[0]
            if hidden.ndim != 3 or hidden.shape[-1] != 384:
                raise RuntimeError("invalid embedding shape")
            pooled = hidden[:, 0, :].astype(np.float32, copy=True)
            pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
            if not np.isfinite(pooled).all():
                raise RuntimeError("invalid embedding")
            vectors.extend(pooled.tolist())
        return vectors

    def record(self, name, count, start):
        stat = self.stats[name]
        stat["requests"] += 1
        stat["items"] += count
        stat["lastMs"] = round((time.monotonic() - start) * 1000)

    def embeddings(self, body):
        if body.get("model", EMBED) != EMBED or body.get("dimensions", 384) not in (384, None):
            raise ValueError("unsupported model or dimensions")
        value = body.get("input")
        items = texts([value] if isinstance(value, str) else value)
        encoding = body.get("encoding_format", "float")
        if encoding not in ("float", "base64"):
            raise ValueError("unsupported encoding")
        start = time.monotonic()
        vectors = self.embed(items)
        self.record("embeddings", len(items), start)
        data = [{"object": "embedding", "index": i, "embedding": v if encoding == "float" else
                 base64.b64encode(np.asarray(v, dtype="<f4").tobytes()).decode("ascii")} for i, v in enumerate(vectors)]
        count = sum(len(self.tokenizer.encode(t).ids) for t in items)
        return {"object": "list", "model": EMBED, "data": data,
                "usage": {"prompt_tokens": count, "total_tokens": count}}

    def rerank(self, body):
        if body.get("model", RANK) != RANK:
            raise ValueError("unsupported model")
        query = texts([body.get("query")])[0]
        docs = texts(body.get("documents"))
        top = body.get("top_n")
        if top is None:
            top = len(docs)
        if type(top) is not int or not 1 <= top <= 128:
            raise ValueError("invalid top_n")
        start = time.monotonic()
        results = []
        for first in range(0, len(docs), 8):
            passages = [{"id": i, "text": docs[i]} for i in range(first, min(first + 8, len(docs)))]
            for item in self.ranker.rerank(RerankRequest(query=query, passages=passages)):
                score = float(item["score"])
                if not np.isfinite(score):
                    raise RuntimeError("invalid score")
                results.append({"index": item["id"], "relevance_score": score})
        results.sort(key=lambda item: (-item["relevance_score"], item["index"]))
        self.record("rerank", len(docs), start)
        return {"results": results[:top]}

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def setup(self):
        super().setup()
        self.connection.settimeout(30)
    def reply(self, status, value):
        raw = json.dumps(value, allow_nan=False, separators=(",", ":")).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)
    def do_GET(self):
        if self.path != "/health":
            return self.reply(404, {"error": "not found"})
        return self.reply(200, {"status": "healthy", "embedding": EMBED, "dimensions": 384,
                                "reranker": RANK, "stats": self.server.models.stats})
    def do_POST(self):
        endpoint = {"/v1/embeddings": self.server.models.embeddings, "/v1/rerank": self.server.models.rerank}.get(self.path)
        if endpoint is None:
            return self.reply(404, {"error": "not found"})
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 2 * 1024 * 1024:
                return self.reply(413, {"error": "invalid request size"})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError("invalid request")
            result = endpoint(body)
        except (ValueError, TypeError, UnicodeError):
            return self.reply(400, {"error": "invalid retrieval request"})
        except Exception:
            return self.reply(500, {"error": "local inference failed"})
        return self.reply(200, result)

if __name__ == "__main__":
    models = Models()
    models.embed(["local retrieval startup"])
    models.ranker.rerank(RerankRequest(query="startup", passages=[{"id": 0, "text": "startup"}]))
    server = HTTPServer(("0.0.0.0", 8090), Handler)
    server.models = models
    print("Local retrieval ready: BGE 384 + FlashRank", flush=True)
    server.serve_forever()
