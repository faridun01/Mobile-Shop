import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { app } from './app';
import { prisma } from './prisma/prisma.service';
import { RealtimeSyncGateway } from './websocket/websocket.gateway';

const port = Number(process.env.PORT || 3001);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, '../..');

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

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Mobile Shop API listening on port ${port}`);
});

RealtimeSyncGateway.init(server);

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