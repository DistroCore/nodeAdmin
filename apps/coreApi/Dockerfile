# ── Build stage ──
FROM node:22-alpine AS builder
WORKDIR /app

# Copy all package files for workspace resolution
COPY package.json package-lock.json* ./
COPY apps/coreApi/package.json ./apps/coreApi/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/coreApi/ ./apps/coreApi/

# Build
RUN npm run build -w coreApi

# Remove only cache/artifacts — keep full node_modules to preserve workspace hoisting

# ── Runtime stage ──
FROM node:22-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/coreApi/node_modules ./apps/coreApi/node_modules
COPY --from=builder /app/apps/coreApi/package.json ./apps/coreApi/package.json
COPY --from=builder /app/apps/coreApi/Dist ./apps/coreApi/Dist
COPY --from=builder /app/packages/shared-types ./packages/shared-types

EXPOSE 11451

CMD ["node", "apps/coreApi/Dist/main.js"]
