import { useEffect, useRef } from 'react';

/** Subscribes to the backend's authenticated WebSocket and invokes onEvent for every broadcast. */
export function useRealtimeSync(token: string | null, onEvent: (type: string, payload: any) => void) {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!token) return;

    let wsUrl = '';
    const customWsUrl = import.meta.env.VITE_WS_URL;

    if (customWsUrl) {
      const separator = customWsUrl.includes('?') ? '&' : '?';
      wsUrl = `${customWsUrl}${separator}token=${encodeURIComponent(token)}`;
    } else {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;
    }

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);
      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEventRef.current(data.type, data.payload);
        } catch (e) {
          console.error('[Realtime Sync Parse Error]:', e);
        }
      };
    } catch {
      // Graceful fallback if the WebSocket server is unreachable
    }

    return () => {
      socket?.close();
    };
  }, [token]);
}
