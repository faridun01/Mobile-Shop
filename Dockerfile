# ==========================================
# STAGE 1: Build Frontend and Server
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

RUN npm ci

# Copy full application source code
COPY . .

# Generate Prisma Client TypeScript definitions
RUN npx prisma generate

# Build Vite Production Bundle
RUN npm run build

# Strip devDependencies now that the bundle and Prisma Client are generated
RUN npm prune --omit=dev

# ==========================================
# STAGE 2: Production Lightweight Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy build artifacts and production-only dependencies from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/server ./server
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh

# Remove the bundled npm CLI (and its vendored deps) - unused at runtime,
# since the entrypoint invokes prisma/tsx binaries directly
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Expose Web Application Port
EXPOSE 3000

USER nodejs

# Launch command
ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
