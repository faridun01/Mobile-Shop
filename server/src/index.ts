import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';

const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, '../..');

dotenv.config({ path: path.join(projectRoot, '.env'), quiet: true });

import { app } from './app';
import { prisma } from './prisma/prisma.service';
import { RealtimeSyncGateway } from './websocket/websocket.gateway';

const port = Number(process.env.PORT || 3001);

// Vite hashes every filename under /assets (content changes -> new filename), so those
// are safe to cache forever; everything else (index.html, sw.js, manifest) must stay
// revalidated on every request so a new deploy is picked up immediately.
app.use(express.static(path.join(projectRoot, 'dist'), {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  },
}));
app.get('*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.sendFile(path.join(projectRoot, 'dist', 'index.html'));
});

import { RetentionService } from './modules/maintenance/retention.service';
import { backfillCatalogFromDevices } from './modules/phone-catalog/phone-catalog.service';

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Mobile Shop API listening on port ${port}`);
});

RealtimeSyncGateway.init(server);

// Retention cleanup on startup and hourly schedule (unref'd so it doesn't block shutdown)
void RetentionService.cleanupOldRecords();
const retentionInterval = setInterval(() => {
  void RetentionService.cleanupOldRecords();
}, 60 * 60 * 1000);
retentionInterval.unref();

void backfillCatalogFromDevices().catch((err) => {
  console.warn('[Startup] backfillCatalogFromDevices non-fatal error:', err);
});

// Global error handlers to prevent unlogged silent exits or unexpected node crashes
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Process] Uncaught Exception:', err);
});

// Stop accepting connections, close realtime sockets (they would otherwise keep server.close
// waiting forever), let in-flight requests finish, then exit. Docker sends SIGKILL 10s after
// SIGTERM, so a request that hangs past 8s is cut here first; every write is one transaction,
// so nothing is left half-done either way.
let shuttingDown = false;
const shutdown = (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, shutting down`);
  setTimeout(() => {
    console.error('Shutdown timed out, forcing exit');
    process.exit(1);
  }, 8_000).unref();
  RealtimeSyncGateway.close();
  server.close(async () => {
    await prisma.$disconnect().catch((error) => console.error('Prisma disconnect failed', error));
    process.exit(0);
  });
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));