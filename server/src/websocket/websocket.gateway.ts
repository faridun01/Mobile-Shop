import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import { AuthService, JwtPayload } from '../auth/auth.service';
import { prisma } from '../prisma/prisma.service';

interface ConnectedClient {
  id: string;
  ws: WebSocket;
  user: JwtPayload;
  authenticated: boolean;
}

interface BroadcastOptions {
  // Restrict delivery to these stores' users (SELLER and PARTNER are bound to one store; the
  // ADMIN always receives everything). Omit for a global event delivered to every client.
  storeIds?: string[];
  // Deliver only to these roles — e.g. admin notifications must never reach store staff.
  roles?: string[];
}

// Soft cap — not a hard security boundary, just a guard against one runaway session
// (a stuck tab reconnect-looping, or genuinely dozens of open tabs) growing the tracked
// connection set without bound.
const MAX_CONNECTIONS_PER_USER = 10;
const WS_AUTH_PROTOCOL = 'auth';
// Proxies drop a socket that carries no traffic: nginx after proxy_read_timeout (60s by default).
// Every dropped socket reconnects and refetches all data, so the server pings well inside that
// window. Browsers answer pings on their own; a socket that misses a whole interval is dead
// (a half-open TCP connection) and is terminated so it stops counting against the user's cap.
const HEARTBEAT_INTERVAL_MS = 30_000;

export class RealtimeSyncGateway {
  private static wss: WebSocketServer;
  private static clients = new Set<ConnectedClient>();
  private static heartbeat: ReturnType<typeof setInterval> | undefined;

  public static init(server: Server, options: { heartbeatIntervalMs?: number } = {}) {
    // The token travels as the second Sec-WebSocket-Protocol value (`auth, <jwt>`) rather than
    // in the URL, so it never lands in proxy access logs. The server answers with `auth` only.
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
      handleProtocols: (protocols) => (protocols.has(WS_AUTH_PROTOCOL) ? WS_AUTH_PROTOCOL : false),
    });

    const alive = new WeakSet<WebSocket>();
    const wss = this.wss;
    this.heartbeat = setInterval(() => {
      for (const ws of wss.clients) {
        if (!alive.has(ws)) { ws.terminate(); continue; }
        alive.delete(ws);
        ws.ping();
      }
    }, options.heartbeatIntervalMs ?? HEARTBEAT_INTERVAL_MS);
    this.heartbeat.unref();
    wss.on('close', () => clearInterval(this.heartbeat));

    this.wss.on('connection', async (ws: WebSocket, request) => {
      alive.add(ws);
      ws.on('pong', () => alive.add(ws));
      const connectionId = crypto.randomUUID();
      const token = RealtimeSyncGateway.extractToken(request.headers['sec-websocket-protocol'], request.url);
      let user: JwtPayload | null = null;
      try { user = token ? await AuthService.authenticateToken(token) : null; }
      catch (error) { console.error('[WebSocket] Session validation failed', error); }

      if (!user) {
        ws.close(1008, 'Unauthorized');
        return;
      }

      // Track early disconnect/error while awaiting the database user check
      let isAborted = false;
      const handleEarlyAbort = () => {
        isAborted = true;
      };
      ws.once('close', handleEarlyAbort);
      ws.once('error', handleEarlyAbort);

      let currentUser = null;
      try {
        currentUser = await prisma.user.findUnique({
          where: { id: user.userId },
          select: { active: true, login: true, role: true, storeId: true }
        });
      } catch (err) {
        console.error(`[WebSocket] DB error checking user for id=${connectionId}:`, err);
      } finally {
        ws.removeListener('close', handleEarlyAbort);
        ws.removeListener('error', handleEarlyAbort);
      }

      // If the client aborted or closed during the async DB query, exit cleanly
      if (isAborted || ws.readyState !== WebSocket.OPEN) {
        return;
      }

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
        const oldest = existingForUser[0];
        oldest.ws.close(1008, 'Too many connections');
        this.clients.delete(oldest);
      }

      const client: ConnectedClient = { id: connectionId, ws, user, authenticated: false };
      this.clients.add(client);
      // Expiry applies to established sockets too, not only new handshakes.
      const expiryTimer = setTimeout(() => ws.close(1008, 'Session expired'), Math.max(0, (user.exp ?? 0) * 1000 - Date.now()));
      expiryTimer.unref();
      console.log(`[WebSocket] CONNECTED    id=${connectionId} user=${user.login} role=${user.role}`);

      ws.on('close', (code, reason) => {
        clearTimeout(expiryTimer);
        this.clients.delete(client);
        const reasonStr = reason ? reason.toString() : '';
        console.log(`[WebSocket] DISCONNECTED id=${connectionId} user=${user.login} role=${user.role} code=${code} reason=${reasonStr}`);
      });

      // `close` normally follows `error` for ws, but isn't guaranteed in every case —
      // without this, a socket that errors without a matching close event stays in the
      // tracked Set forever (broadcast() skips it via readyState, but it never gets
      // removed, and it would count against this same client's own connection cap above).
      ws.on('error', (err) => {
        console.error(`[WebSocket] ERROR        id=${connectionId} user=${user.login}`, err);
        this.clients.delete(client);
      });

      // Clients are receive-only: sync events are always server-triggered from real
      // mutations, never relayed from client-sent messages (closes an open-relay hole).
      ws.on('message', () => {
        /* no-op: inbound messages are ignored */
      });
      // Logout/password changes can commit while the handshake awaits the DB.
      // Register first, then recheck: revocation now either finds this client or
      // is observed here. Never broadcast to a client before this check completes.
      try {
        const current = await AuthService.authenticateToken(token!);
        if (!current) { ws.close(1008, 'Session disabled'); return; }
        client.user = current;
        client.authenticated = ws.readyState === WebSocket.OPEN;
      } catch {
        ws.close(1008, 'Session validation failed');
      }
    });
  }

  /** Token from `Sec-WebSocket-Protocol: auth, <jwt>`, else the legacy `?token=` (older app builds). */
  public static extractToken(protocolHeader: string | string[] | undefined, requestUrl: string | undefined): string | null {
    const header = Array.isArray(protocolHeader) ? protocolHeader.join(',') : protocolHeader;
    const protocols = (header ?? '').split(',').map((p) => p.trim()).filter(Boolean);
    if (protocols[0] === WS_AUTH_PROTOCOL && protocols[1]) return protocols[1];
    return new URL(requestUrl ?? '', 'http://localhost').searchParams.get('token');
  }

  public static disconnectUser(userId: string) {
    for (const client of this.clients) {
      if (client.user.userId === userId) client.ws.close(1008, 'Session disabled');
    }
  }

  public static disconnectSession(sessionId: string) {
    for (const client of this.clients) {
      if (client.user.sessionId === sessionId) client.ws.close(1008, 'Session disabled');
    }
  }

  /** Shutdown: 1001 tells clients to reconnect (to the next instance) rather than re-login. */
  public static close() {
    if (!this.wss) return;
    clearInterval(this.heartbeat);
    for (const ws of this.wss.clients) ws.close(1001, 'Server shutting down');
    this.wss.close();
  }

  public static broadcast(eventType: string, payload: any, options: BroadcastOptions = {}) {
    if (!this.wss) return;

    const message = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });

    for (const client of this.clients) {
      if (!client.authenticated || client.ws.readyState !== WebSocket.OPEN) continue;

      if (options.roles && !options.roles.includes(client.user.role)) continue;
      // PARTNER is store-scoped like SELLER: only the ADMIN sees every store's events.
      const canSeeEverything = client.user.role === 'ADMIN';
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
