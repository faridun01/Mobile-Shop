import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { app } from './app';
import { prisma } from './prisma/prisma.service';
import { RealtimeSyncGateway } from './websocket/websocket.gateway';

const port = Number(process.env.PORT || 3002);
const currentFile = fileURLToPath(import.meta.url);
const currentDirectory = path.dirname(currentFile);
const projectRoot = path.resolve(currentDirectory, '../..');

app.use(express.static(path.join(projectRoot, 'dist')));
app.get('*', (_req, res) => res.sendFile(path.join(projectRoot, 'dist', 'index.html')));

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`Mobile Shop API listening on port ${port}`);
});

RealtimeSyncGateway.init(server);

const shutdown = async () => {
  server.close();
  await prisma.$disconnect();
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);