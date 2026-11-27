"""Exercise real packaged inference over HTTP with synthetic data."""
import base64
import json
import math
import urllib.request
import urllib.error

def req(path, body=None):
    data = None if body is None else json.dumps(body).encode()
    r = urllib.request.Request("http://127.0.0.1:8090" + path, data=data,
                               headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(r, timeout=30) as reply:
        return json.load(reply)

assert req("/health")["dimensions"] == 384
q = "What kind of music does the user enjoy?"
docs = ["The user enjoys melodic death metal.", "The user owns a cat named Pumpkin.",
        "The user listens to synthwave.", "The user works as a web developer."]
v = req("/v1/embeddings", {"input": [q] + docs})["data"]
assert [d["index"] for d in v] == list(range(5))
assert all(len(d["embedding"]) == 384 and abs(math.sqrt(sum(x*x for x in d["embedding"]))-1) < 0.001 for d in v)
sim = [sum(a*b for a,b in zip(v[0]["embedding"], d["embedding"])) for d in v[1:]]
assert min(sim[0],sim[2]) > max(sim[1],sim[3]), sim
one = req("/v1/embeddings", {"input": q})["data"][0]["embedding"]
# Quantized ONNX may vary slightly with dynamic padding.
assert sum(a*b for a,b in zip(one,v[0]["embedding"])) > 0.99
assert len(base64.b64decode(req("/v1/embeddings", {"input": q, "encoding_format": "base64"})["data"][0]["embedding"])) == 1536
r = req("/v1/rerank", {"query": q, "documents": docs, "top_n": 2})["results"]
assert {x["index"] for x in r} == {0, 2}, r
assert r[0]["relevance_score"] >= r[1]["relevance_score"]
try:
    req("/v1/embeddings", {"input": q, "dimensions": 1024})
    raise AssertionError("dimension mismatch accepted")
except urllib.error.HTTPError as e:
    assert e.code == 400
print("Local retrieval HTTP smoke passed", req("/health"))
