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

# Bundle the server into one plain JS file (server/dist/index.mjs), so production starts it with
# node instead of compiling TypeScript on every start: about half the start time and ~25 MB less memory.
RUN npm run build:server

# Strip devDependencies now that the bundle and Prisma Client are generated
RUN npm prune --omit=dev

# The server needs only express, @prisma/client, prisma (migrations), tsx, ws, web-push and dotenv.
# The libraries below are compiled into dist/ already (or are native-app only), so the runtime
# image does not carry them; package.json and the lockfile stay unchanged (--no-save).
RUN npm uninstall --no-save --omit=dev --no-audit --no-fund \
      lucide-react exceljs html5-qrcode react react-dom react-router-dom zustand \
      @capacitor/core @capacitor/android @capacitor/ios @capacitor/app @capacitor/filesystem \
      @capacitor/push-notifications @capacitor/share @capacitor/status-bar @capacitor-mlkit/barcode-scanning \
  && rm -rf node_modules/typescript

# ==========================================
# STAGE 2: Production Lightweight Runner
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Pull the latest Alpine security patches (e.g. OpenSSL) at build time, since the
# base image tag can lag behind newly-disclosed CVEs between its own rebuilds.
RUN apk update && apk upgrade --no-cache

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
RUN chmod +x ./docker-entrypoint.sh

# Remove the bundled npm CLI (and its vendored deps) - unused at runtime,
# since the entrypoint invokes prisma/tsx binaries directly
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

# Expose Web Application Port
EXPOSE 3000

USER nodejs

# Launch command
ENTRYPOINT ["/bin/sh", "./docker-entrypoint.sh"]
