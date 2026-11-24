FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY nas/ /app/nas/
COPY src/notion-reading.ts src/notion-knowledge.ts src/brain-eval-fixtures.ts src/brain-eval-cloud.ts src/model-switcher.ts src/assistant-voice.ts src/personality.ts src/communication-preferences.ts src/companion-profile.ts src/avatar-background.ts src/avatar-viewport.ts src/memory-import.ts src/interest-import.ts src/memory-ranking.ts src/identity-memory.ts src/character-canon-routing.ts src/interest-context.ts src/archive-memory.ts src/memory-budget.ts /app/src/
COPY assets/iki/mikan-chat-avatar.webp /app/nas/assets/mikan-chat-avatar.webp
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3847
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3847/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "nas/server.mjs"]
