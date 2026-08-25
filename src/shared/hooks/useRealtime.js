"use client";

// Shared SSE hook — subscribes to /api/dashboard/realtime for live data.
//
// All realtime widgets on the dashboard share ONE EventSource instead of
// opening one per component (the StatusBar, Overview, Usage, Providers,
// Combos, Proxy Pools, etc. would otherwise each spawn a connection to the
// same endpoint). A module-level manager ref-counts subscribers: the
// connection opens when the first subscriber subscribes and closes when the
// last one leaves.
//
// Reconnects use exponential backoff with jitter (1s -> 2s -> 4s -> ... capped
// at 30s) instead of a fixed delay, and the native EventSource auto-reconnect
// is suppressed (we close on error and drive our own timer) so the browser's
// retry loop never races ours.
//
// Returns connection state: "connecting" | "live" | "reconnecting".
// Style guide: every real-time widget shows a "live" (teal pulsing dot) or
// "Reconnecting" (amber) badge based on this state.

import { useEffect, useRef, useState } from "react";

const REALTIME_URL = "/api/dashboard/realtime";

// Reconnect policy. BASE_DELAY * BACKOFF_FACTOR^attempt, capped at MAX_DELAY,
// then ±20% jitter so many clients don't resync in lockstep after a server
// restart.
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;
const BACKOFF_FACTOR = 2;

// Lazy singleton so importing the module doesn't create a connection until a
// realtime widget actually mounts.
let shared = null;

function getShared() {
  if (!shared) shared = createManager();
  return shared;
}

function createManager() {
  const subscribers = new Set(); // each entry: { onData, onState }
  let es = null;
  let retryTimer = null;
  let attempt = 0;
  let connState = "connecting";

  const notifyState = (next) => {
    if (connState === next) return;
    connState = next;
    for (const sub of subscribers) {
      try { sub.onState?.(next); } catch { /* ignore */ }
    }
  };

  const broadcast = (data) => {
    for (const sub of subscribers) {
      try { sub.onData(data); } catch { /* ignore */ }
    }
  };

  const teardown = () => {
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (es) {
      // Detach handlers first so a late event can't re-schedule a reconnect
      // after we've closed (avoids a dangling timer keeping the module alive).
      es.onopen = es.onmessage = es.onerror = null;
      es.close();
      es = null;
    }
    attempt = 0;
  };

  const scheduleReconnect = () => {
    if (subscribers.size === 0) return;
    // Never stack two reconnect timers (defensive: onerror can fire more than
    // once if a connection dies mid-handshake).
    if (retryTimer) clearTimeout(retryTimer);
    const delay = Math.min(
      BASE_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt),
      MAX_DELAY_MS
    );
    attempt += 1;
    const jittered = Math.round(delay * (0.8 + Math.random() * 0.4));
    retryTimer = setTimeout(connect, jittered);
  };

  const connect = () => {
    if (subscribers.size === 0) return;
    if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
    if (es) es.close();

    const source = new EventSource(REALTIME_URL);
    es = source;

    source.onopen = () => {
      attempt = 0;
      notifyState("live");
    };

    source.onmessage = (e) => {
      try {
        broadcast(JSON.parse(e.data));
      } catch { /* malformed event — keep the stream alive */ }
    };

    source.onerror = () => {
      // Close so the browser's native auto-reconnect (which would fight our
      // backoff loop with its own fixed cadence) never kicks in.
      source.close();
      if (es === source) es = null;
      notifyState("reconnecting");
      scheduleReconnect();
    };
  };

  return {
    subscribe(onData, onState) {
      const sub = { onData, onState };
      subscribers.add(sub);
      if (!es) connect();
      // Sync the current state so a late subscriber (e.g. a page mounted after
      // the connection already went live) renders the right badge immediately.
      try { onState?.(connState); } catch { /* ignore */ }
      return () => {
        subscribers.delete(sub);
        if (subscribers.size === 0) {
          teardown();
          connState = "connecting"; // fresh slate for the next subscriber
        }
      };
    },
  };
}

export function useRealtime(onEvent) {
  const [connState, setConnState] = useState("connecting");
  const onEventRef = useRef(onEvent);

  // Keep the latest callback in a ref (avoids re-subscribing on every render)
  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    return getShared().subscribe(
      (data) => {
        try { onEventRef.current?.(data); } catch { /* ignore */ }
      },
      setConnState
    );
  }, []);

  return connState;
}

// Event-driven refetch: subscribes to the same shared SSE stream and calls
// refresh() on every real data event (comments/keepalives are ignored by
// EventSource). Replaces fixed-interval polling — data updates the moment it
// changes. Shares the single dashboard connection; closes when disabled or
// unmounted.
export function useLiveRefresh(refresh, enabled = true) {
  const refreshRef = useRef(refresh);

  // Keep the latest refresh callback in a ref (avoids re-subscribing on every render)
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    return getShared().subscribe(() => {
      try { refreshRef.current(); } catch { /* ignore */ }
    }, null);
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
