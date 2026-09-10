import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { AuthService, JwtPayload } from '../auth/auth.service';
import { prisma } from '../prisma/prisma.service';

interface ConnectedClient {
  ws: WebSocket;
  user: JwtPayload;
}

export interface BroadcastOptions {
  // Restrict delivery to these stores' SELLER users (ADMIN/PARTNER always receive everything).
  // Omit for a global event delivered to every authenticated client.
  storeIds?: string[];
}

// Soft cap — not a hard security boundary, just a guard against one runaway session
// (a stuck tab reconnect-looping, or genuinely dozens of open tabs) growing the tracked
// connection set without bound.
const MAX_CONNECTIONS_PER_USER = 10;

export class RealtimeSyncGateway {
  private static wss: WebSocketServer;
  private static clients = new Set<ConnectedClient>();

  public static init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', async (ws: WebSocket, request) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      const user = token ? AuthService.verifyToken(token) : null;

      if (!user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      const currentUser = await prisma.user.findUnique({ where: { id: user.userId }, select: { active: true, login: true, role: true, storeId: true } }).catch(() => null);
      if (!currentUser?.active) {
        ws.close(1008, 'Unauthorized');
        return;
      }
      user.login = currentUser.login;
      user.role = currentUser.role;
      user.storeId = currentUser.storeId;

      const existingForUser = Array.from(this.clients).filter((c) => c.user.userId === user.userId);
      if (existingForUser.length >= MAX_CONNECTIONS_PER_USER) {
        // Drop the oldest connection for this user rather than refusing the new one —
        // a stuck reconnect loop self-heals instead of locking the user out entirely.
        existingForUser[0].ws.close(1008, 'Too many connections');
      }

      const client: ConnectedClient = { ws, user };
      this.clients.add(client);
      console.log(`[WebSocket]: ${user.role} ${user.login} connected`);

      ws.on('close', () => {
        this.clients.delete(client);
      });

      // `close` normally follows `error` for ws, but isn't guaranteed in every case —
      // without this, a socket that errors without a matching close event stays in the
      // tracked Set forever (broadcast() skips it via readyState, but it never gets
      // removed, and it would count against this same client's own connection cap above).
      ws.on('error', (err) => {
        console.error(`[WebSocket]: connection error for ${user.login}`, err);
        this.clients.delete(client);
      });

      // Clients are receive-only: sync events are always server-triggered from real
      // mutations, never relayed from client-sent messages (closes an open-relay hole).
      ws.on('message', () => {
        /* no-op: inbound messages are ignored */
      });
    });
  }

  public static disconnectUser(userId: string) {
    for (const client of this.clients) {
      if (client.user.userId === userId) client.ws.close(1008, 'Session disabled');
    }
  }

  public static broadcast(eventType: string, payload: any, options: BroadcastOptions = {}) {
    if (!this.wss) return;

    const message = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;

      const canSeeEverything = client.user.role === 'ADMIN' || client.user.role === 'PARTNER';
      const inScope =
        !options.storeIds ||
        canSeeEverything ||
        (client.user.storeId != null && options.storeIds.includes(client.user.storeId));

      if (inScope) {
        client.ws.send(message);
      }
    }
  }
}
