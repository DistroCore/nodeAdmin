# ── Build stage ──
FROM node:22-alpine AS builder
WORKDIR /app

# API base URL — empty means same-origin (nginx proxies /api/ to coreapi)
ARG VITE_CORE_API_BASE_URL=
ENV VITE_CORE_API_BASE_URL=$VITE_CORE_API_BASE_URL

# Copy all package files for workspace resolution
COPY package.json package-lock.json* ./
COPY apps/adminPortal/package.json ./apps/adminPortal/
COPY packages/shared-types/package.json ./packages/shared-types/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source
COPY packages/shared-types/ ./packages/shared-types/
COPY apps/adminPortal/ ./apps/adminPortal/

# Build (tsc + vite)
RUN npm run build -w adminPortal

# ── Runtime stage (nginx static hosting) ──
FROM nginx:1.27-alpine
COPY --from=builder /app/apps/adminPortal/dist /usr/share/nginx/html
COPY infra/docker/nginx/adminportal.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
