# ==========================================
# STAGE 1: Build Frontend and Server
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package manifests and install dependencies
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

RUN npm ci

# Copy full application source code
COPY . .

# Generate Prisma Client TypeScript definitions
RUN npx prisma generate

# Build Vite Production Bundle
RUN npm run build

# ==========================================
# STAGE 2: Production Lightweight Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Create non-root system user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy build artifacts and dependencies from builder stage
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/server ./server

# Expose Web Application Port
EXPOSE 3000

USER nodejs

# Launch command
CMD ["npm", "run", "preview"]
