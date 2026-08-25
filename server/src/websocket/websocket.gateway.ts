import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { AuthService, JwtPayload } from '../auth/auth.service';

interface ConnectedClient {
  ws: WebSocket;
  user: JwtPayload;
}

export interface BroadcastOptions {
  // Restrict delivery to these stores' SELLER users (ADMIN/PARTNER always receive everything).
  // Omit for a global event delivered to every authenticated client.
  storeIds?: string[];
}

export class RealtimeSyncGateway {
  private static wss: WebSocketServer;
  private static clients = new Set<ConnectedClient>();

  public static init(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, request) => {
      const url = new URL(request.url ?? '', 'http://localhost');
      const token = url.searchParams.get('token');
      const user = token ? AuthService.verifyToken(token) : null;

      if (!user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      const client: ConnectedClient = { ws, user };
      this.clients.add(client);
      console.log(`[WebSocket]: ${user.role} ${user.login} connected`);

      ws.on('close', () => {
        this.clients.delete(client);
      });

      // Clients are receive-only: sync events are always server-triggered from real
      // mutations, never relayed from client-sent messages (closes an open-relay hole).
      ws.on('message', () => {
        /* no-op: inbound messages are ignored */
      });
    });
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
