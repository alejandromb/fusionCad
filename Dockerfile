# fusionCad API — Multi-stage Docker build
# Handles monorepo workspace dependencies (core-model, core-engine)

# ── Build stage ──
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root config files for dependency resolution
COPY package.json package-lock.json tsconfig.json ./

# Copy workspace package.json files (for npm ci caching)
COPY packages/core-model/package.json packages/core-model/
COPY packages/core-engine/package.json packages/core-engine/
COPY apps/api/package.json apps/api/

# Install all dependencies
RUN npm ci --ignore-scripts

# Copy source code for build
COPY packages/core-model/ packages/core-model/
COPY packages/core-engine/ packages/core-engine/
COPY apps/api/ apps/api/

# Build in dependency order
RUN npm run build --workspace=packages/core-model \
 && npm run build --workspace=packages/core-engine \
 && npm run build --workspace=apps/api

# ── Runtime stage ──
FROM node:20-alpine
WORKDIR /app

# Copy root package files + node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules

# Copy built workspace packages (dist + package.json)
COPY --from=builder /app/packages/core-model/dist ./packages/core-model/dist
COPY --from=builder /app/packages/core-model/package.json ./packages/core-model/

COPY --from=builder /app/packages/core-engine/dist ./packages/core-engine/dist
COPY --from=builder /app/packages/core-engine/package.json ./packages/core-engine/

COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/

ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "apps/api/dist/index.js"]
