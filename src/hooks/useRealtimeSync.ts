import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    let socket: WebSocket | null = null;

    try {
      socket = new WebSocket(wsUrl);

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('[Realtime Sync Received]:', data.type);

          // Refresh TanStack Query cache automatically on server broadcast
          if (['INVENTORY_UPDATE', 'SALE_COMPLETED', 'TRANSFER_UPDATED', 'REPAIR_UPDATED'].includes(data.type)) {
            queryClient.invalidateQueries();
          }
        } catch (e) {
          console.error('[Realtime Sync Parse Error]:', e);
        }
      };
    } catch {
      // Graceful fallback if WebSocket server is not connected
    }

    return () => {
      socket?.close();
    };
  }, [queryClient]);
}
