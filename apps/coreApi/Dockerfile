# ── Base stage ──
FROM node:22-alpine AS base
WORKDIR /app

# ── Dependency stage (full deps for build) ──
FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/coreApi/package.json ./apps/coreApi/
COPY packages/shared-types/package.json ./packages/shared-types/
RUN npm ci --ignore-scripts

# ── Build stage ──
FROM deps AS builder
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/coreApi/ ./apps/coreApi/
RUN npm run build -w coreApi

# ── Runtime stage ──
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/coreApi/node_modules ./apps/coreApi/node_modules
COPY --from=builder /app/apps/coreApi/package.json ./apps/coreApi/package.json
COPY --from=builder /app/apps/coreApi/dist ./apps/coreApi/dist
COPY --from=builder /app/packages/shared-types ./packages/shared-types

EXPOSE 11451

CMD ["node", "apps/coreApi/dist/main.js"]
