import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

vi.mock('../auth/auth.service', () => ({
  AuthService: {
    authenticateToken: vi.fn().mockResolvedValue({
      userId: 'u1', login: 'seller', role: 'SELLER', storeId: 's1', sessionId: 'sess1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  },
}));

vi.mock('../prisma/prisma.service', () => ({
  prisma: { user: { findUnique: vi.fn().mockResolvedValue({ active: true, login: 'seller', role: 'SELLER', storeId: 's1' }) } },
}));

import { RealtimeSyncGateway } from './websocket.gateway';

let server: Server;

async function start(heartbeatIntervalMs: number) {
  server = createServer();
  RealtimeSyncGateway.init(server, { heartbeatIntervalMs });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return `ws://127.0.0.1:${(server.address() as AddressInfo).port}/ws`;
}

function connect(url: string, autoPong = true) {
  const ws = new WebSocket(url, ['auth', 'token'], { autoPong });
  const closed = new Promise<number>((resolve) => ws.on('close', (code) => resolve(code)));
  return { ws, closed, opened: new Promise<void>((resolve) => ws.on('open', () => resolve())) };
}

afterEach(async () => {
  RealtimeSyncGateway.close();
  await new Promise((resolve) => server.close(resolve));
});

describe('RealtimeSyncGateway heartbeat', () => {
  it('terminates a socket that stops answering pings and keeps a live one open', async () => {
    const url = await start(50);
    const live = connect(url);
    const dead = connect(url, false);
    await Promise.all([live.opened, dead.opened]);

    // Abnormal closure: the server terminated the socket instead of a close handshake.
    expect(await dead.closed).toBe(1006);
    expect(live.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('close() tells clients the server is going away so they reconnect', async () => {
    const url = await start(60_000);
    const client = connect(url);
    await client.opened;

    RealtimeSyncGateway.close();
    expect(await client.closed).toBe(1001);
  });
});
