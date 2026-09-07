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
    let stopped = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryDelay = 1000;
    let hasConnected = false;

    function scheduleReconnect() {
      if (stopped || retryTimer !== undefined) return;
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 30000);
    }

    function connect() {
      if (stopped) return;
      try {
        const connection = new WebSocket(wsUrl);
        socket = connection;
        connection.onopen = () => {
          retryDelay = 1000;
          if (hasConnected) onEventRef.current('RECONNECTED', null);
          hasConnected = true;
        };
        connection.onmessage = (event) => {
          if (stopped) return;
          try {
            const data = JSON.parse(event.data);
            onEventRef.current(data.type, data.payload);
          } catch (e) {
            console.error('[Realtime Sync Parse Error]:', e);
          }
        };
        connection.onclose = (event) => {
          // Authorization failures require a new token, not repeated connections.
          if (event.code !== 1008) scheduleReconnect();
        };
        // Failed connections also emit close; keep retries in one place.
        connection.onerror = () => connection.close();
      } catch {
        scheduleReconnect();
      }
    }

    connect();

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      if (socket) {
        socket.onopen = null;
        socket.onmessage = null;
        socket.onclose = null;
        socket.onerror = null;
        socket.close();
      }
    };
  }, [token]);
}
