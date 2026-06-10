# ── Stage 1: Dependencies ─────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev

# ── Stage 2: Production ──────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend/ ./backend/
COPY frontend/ ./frontend/

RUN mkdir -p /app/backend/uploads && chown -R appuser:appgroup /app

USER appuser

EXPOSE 3000

CMD ["node", "backend/server.js"]
