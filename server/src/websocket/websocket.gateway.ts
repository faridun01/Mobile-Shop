import { WebSocketServer, WebSocket } from 'ws';

export class RealtimeSyncGateway {
  private static wss: WebSocketServer;

  public static init(server: any) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket]: New cashier/terminal connected');

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message.toString());
          // Broadcast message to all connected clients except sender
          this.broadcast(data.type, data.payload, ws);
        } catch (e) {
          console.error('[WebSocket Error]:', e);
        }
      });
    });
  }

  public static broadcast(eventType: string, payload: any, senderWs?: WebSocket) {
    if (!this.wss) return;

    const message = JSON.stringify({ type: eventType, payload, timestamp: new Date().toISOString() });

    this.wss.clients.forEach((client) => {
      if (client !== senderWs && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }
}
