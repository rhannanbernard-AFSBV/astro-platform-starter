# OmniClean API — Railway / container deploy
FROM node:22-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY migrations ./migrations
COPY src ./src

# Persistent volume should mount at /app/data (PGlite or uploads)
RUN mkdir -p /app/data/signatures /app/data/qa-photos /app/data/insurance

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/index.js"]
