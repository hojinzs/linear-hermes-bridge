# syntax=docker/dockerfile:1.7
# Linear Hermes Bridge — homelab Docker image.
# Runs only the bridge service; Hermes Agent runs separately and is reached via connector configuration.

# ---------- Stage 1: install workspace deps ----------
FROM node:22-bookworm-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/bridge/package.json apps/bridge/package.json
COPY apps/web/package.json apps/web/package.json

# Install only what the bridge needs (incl. its dev deps for the build stage).
RUN pnpm install --frozen-lockfile --filter @lhb/bridge...

# ---------- Stage 2: build TypeScript ----------
FROM node:22-bookworm-slim AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY --from=deps /app /app
COPY tsconfig.base.json ./tsconfig.base.json
COPY apps/bridge ./apps/bridge
RUN pnpm --filter @lhb/bridge run build

# ---------- Stage 3: prune to production deps ----------
FROM node:22-bookworm-slim AS prod-deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/bridge/package.json apps/bridge/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --prod --filter @lhb/bridge...

# ---------- Stage 4: runtime ----------
FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATABASE_URL=file:/app/data/bridge.db

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/bridge/node_modules ./apps/bridge/node_modules
COPY --from=builder /app/apps/bridge/dist ./apps/bridge/dist
# Drizzle migrations are .sql, tsc does not emit them — copy alongside dist/.
COPY --from=builder /app/apps/bridge/src/db/migrations ./apps/bridge/dist/db/migrations
COPY apps/bridge/package.json ./apps/bridge/package.json
COPY package.json pnpm-workspace.yaml ./

RUN mkdir -p /app/data
VOLUME ["/app/data"]
EXPOSE 8787

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

WORKDIR /app/apps/bridge
CMD ["node", "dist/index.js"]
