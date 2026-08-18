"use client";

// Shared SSE hook — subscribes to /api/dashboard/realtime for live data.
// Returns connection state: "connecting" | "live" | "reconnecting".
// Style guide: every real-time widget shows a "live" (teal pulsing dot) or
// "Reconnecting" (amber) badge based on this state.

import { useEffect, useRef, useState } from "react";

export function useRealtime(onEvent) {
  const [connState, setConnState] = useState("connecting");
  const onEventRef = useRef(onEvent);

  // Keep the latest callback in a ref (avoids re-subscribing on every render)
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    let es = null;
    let retryTimer = null;
    let closed = false;

    const connect = () => {
      if (closed) return;
      es = new EventSource("/api/dashboard/realtime");

      es.onopen = () => setConnState("live");

      es.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data);
          if (onEventRef.current) onEventRef.current(data);
        } catch { /* malformed event */ }
      };

      es.onerror = () => {
        setConnState("reconnecting");
        es.close();
        // Retry with backoff-ish delay
        retryTimer = setTimeout(connect, 5000);
      };
    };

    connect();

    return () => {
      closed = true;
      if (es) es.close();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, []);

  return connState;
}

// Event-driven refetch: subscribes to the same SSE stream and calls refresh()
// on every real data event (comments/keepalives are ignored by EventSource).
// Replaces fixed-interval polling — data updates the moment it changes.
export function useLiveRefresh(refresh, enabled = true) {
  const refreshRef = useRef(refresh);

  // Keep the latest refresh callback in a ref (avoids re-subscribing on every render)
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    const es = new EventSource("/api/dashboard/realtime");
    es.onmessage = () => {
      try { refreshRef.current(); } catch { /* ignore */ }
    };
    return () => es.close();
  }, [enabled]);
}

// Small badge component: "live" (cyan pulsing dot) / "Reconnecting" (orange).
export function LiveBadge({ state }) {
  if (state === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-c-blue-50/10 px-3 py-1 text-[12px] text-c-blue-800 border border-c-blue-600/30">
        <span className="size-1.5 rounded-full bg-c-cyan pulse-dot" />
        Live
      </span>
    );
  }
  if (state === "reconnecting") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-c-amber-50/10 px-3 py-1 text-[12px] text-c-amber-800 border border-c-amber-600/30">
        <span className="size-1.5 rounded-full bg-c-amber-600" />
        Reconnecting
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-c-gray-50/10 px-3 py-1 text-[12px] text-text-muted border border-border">
      <span className="size-1.5 rounded-full bg-text-subtle" />
      Connecting
    </span>
  );
}
