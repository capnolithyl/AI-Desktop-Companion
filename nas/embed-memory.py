"""Local, read-only sentence embeddings. No network access or model downloads at runtime."""
import json
import os
import sys
import numpy as np
import onnxruntime as ort
from tokenizers import Tokenizer

root = os.environ.get("MIKAN_EMBEDDINGS_DIR", "/opt/mikan-embeddings")
texts = json.load(sys.stdin)
if not isinstance(texts, list) or not 1 <= len(texts) <= 129:
    raise ValueError("invalid embedding batch")
if any(not isinstance(t, str) or len(t) > 2000 for t in texts):
    raise ValueError("invalid embedding text")
tokenizer = Tokenizer.from_file(os.path.join(root, "tokenizer.json"))
tokenizer.enable_truncation(max_length=192)
tokenizer.enable_padding(pad_id=0, pad_token="[PAD]")
options = ort.SessionOptions()
options.intra_op_num_threads = 2
options.inter_op_num_threads = 1
options.enable_cpu_mem_arena = False
session = ort.InferenceSession(os.path.join(root, "model.onnx"), sess_options=options, providers=["CPUExecutionProvider"])
names = {i.name for i in session.get_inputs()}
vectors = []
for start in range(0, len(texts), 8):
    enc = tokenizer.encode_batch(texts[start:start + 8])
    mask = np.array([e.attention_mask for e in enc], dtype=np.int64)
    inputs = {
        "input_ids": np.array([e.ids for e in enc], dtype=np.int64),
        "attention_mask": mask,
        "token_type_ids": np.array([e.type_ids for e in enc], dtype=np.int64),
    }
    hidden = session.run(None, {k: v for k, v in inputs.items() if k in names})[0]
    pooled = (hidden * mask[:, :, None]).sum(axis=1) / np.maximum(mask.sum(axis=1)[:, None], 1)
    pooled /= np.maximum(np.linalg.norm(pooled, axis=1, keepdims=True), 1e-12)
    vectors.extend(pooled.astype(np.float32).tolist())
json.dump(vectors, sys.stdout, separators=(",", ":"), allow_nan=False)
