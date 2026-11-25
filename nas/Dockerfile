FROM rust:1-bookworm AS native-builder
WORKDIR /build
COPY nas/research-native/ nas/research-native/
COPY src-tauri/src/ src-tauri/src/
RUN cargo test --manifest-path nas/research-native/Cargo.toml && cargo build --release --manifest-path nas/research-native/Cargo.toml
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
ARG EMBEDDING_REVISION=855bcf54d21334332f75db10bdd48970ff0ef547
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /opt/mikan-embeddings \
    && python3 -m venv /opt/mikan-embeddings/venv \
    && /opt/mikan-embeddings/venv/bin/pip install --no-cache-dir numpy==1.26.4 onnxruntime==1.20.1 tokenizers==0.21.0 \
    && curl -fsSL --retry 3 "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/${EMBEDDING_REVISION}/onnx/model_quint8_avx2.onnx" -o /opt/mikan-embeddings/model.onnx \
    && curl -fsSL --retry 3 "https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2/resolve/${EMBEDDING_REVISION}/tokenizer.json" -o /opt/mikan-embeddings/tokenizer.json
COPY nas/ /app/nas/
COPY src/notion-reading.ts src/notion-knowledge.ts src/assistant-instructions.ts src/personal-grounding.ts src/runtime-context.ts src/conversation-engine.ts src/narration-filter.ts src/evidence-verification.ts src/brain-eval-fixtures.ts src/brain-eval-cloud.ts src/model-switcher.ts src/assistant-voice.ts src/personality.ts src/communication-preferences.ts src/companion-profile.ts src/avatar-background.ts src/avatar-viewport.ts src/memory-import.ts src/interest-import.ts src/memory-ranking.ts src/identity-memory.ts src/character-canon-routing.ts src/interest-context.ts src/archive-memory.ts src/memory-budget.ts src/memory-retrieval.ts src/session-memory.ts src/unified-planner.ts /app/src/
COPY --from=native-builder /build/nas/research-native/target/release/mikan-research-native /app/nas/mikan-research-native
COPY assets/iki/mikan-chat-avatar.webp /app/nas/assets/mikan-chat-avatar.webp
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3847
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3847/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "nas/server.mjs"]
