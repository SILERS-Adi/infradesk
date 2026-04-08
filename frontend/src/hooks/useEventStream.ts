import { useEffect, useRef, useCallback, useState } from 'react';

interface BadgeData {
  ticketQueue: number;
  activeTasks: number;
}

/**
 * SSE hook for real-time badge updates.
 * Connects to /api/events/stream and receives push updates.
 * Falls back gracefully — if SSE fails, components continue with React Query polling.
 */
export function useEventStream() {
  const [badges, setBadges] = useState<BadgeData>({ ticketQueue: 0, activeTasks: 0 });
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    if (eventSourceRef.current) return;

    try {
      const baseUrl = import.meta.env.VITE_API_URL || '';
      const es = new EventSource(`${baseUrl}/api/events/stream`, { withCredentials: true });

      es.addEventListener('connected', () => {
        setConnected(true);
        retriesRef.current = 0;
      });

      es.addEventListener('badges', (e) => {
        try {
          const data = JSON.parse(e.data) as BadgeData;
          setBadges(data);
        } catch { /* malformed data */ }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Exponential backoff reconnect (max 60s)
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 60000);
        retriesRef.current++;
        setTimeout(connect, delay);
      };

      eventSourceRef.current = es;
    } catch {
      // SSE not supported or blocked — silent fallback
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [connect]);

  return { badges, connected };
}
