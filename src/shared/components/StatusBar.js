"use client";

// tmux-style global status bar — server status, uptime, active connections,
// rate limit, port and a live clock. Terminal aesthetic. Real-time via SSE push
// (no fixed-interval polling); a local 1s tick only advances the uptime clock.

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveRefresh } from "@/shared/hooks/useRealtime";

function Clock() {
  const [now, setNow] = useState(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="tabular-nums">
      {now ? now.toLocaleTimeString("en-GB") : "--:--:--"}
    </span>
  );
}

export default function StatusBar() {
  const [server, setServer] = useState({ ok: null, uptime: null });
  const [connections, setConnections] = useState(0);
  const [port, setPort] = useState("----");
  const [, setTick] = useState(0);
  const upAtRef = useRef(null);

  useEffect(() => {
    setPort(window.location.port || "80");
  }, []);

  const poll = useCallback(async () => {
    try {
      const [healthRes, providersRes] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/providers/client?page=1&pageSize=500", { cache: "no-store" }),
      ]);
      let uptime = null;
      if (healthRes.ok) {
        const h = await healthRes.json();
        uptime = h.uptimeSec ?? h.uptime ?? null;
        upAtRef.current = uptime == null ? null : Date.now();
      }
      let count = 0;
      if (providersRes.ok) {
        const p = await providersRes.json();
        count = (p.totals?.connectionCount ?? p.connections?.length ?? 0);
      }
      setServer({ ok: healthRes.ok, uptime });
      setConnections(count);
    } catch {
      setServer({ ok: false, uptime: null });
    }
  }, []);

  useEffect(() => {
    poll();
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, [poll]);

  // Refetch on every live push (no fixed-interval polling)
  useLiveRefresh(poll);

  // Local uptime tick anchored to the last server snapshot (drift-free)
  const uptimeVal = server.uptime == null
    ? null
    : server.uptime + (upAtRef.current ? Math.floor((Date.now() - upAtRef.current) / 1000) : 0);

  const formatUptime = (sec) => {
    if (sec == null) return "--:--:--";
    const s = Math.floor(Number(sec));
    const h = String(Math.floor(s / 3600)).padStart(2, "0");
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    return `${h}:${m}:${ss}`;
  };

  const serverState =
    server.ok === null
      ? { label: "CHECKING", cls: "status-warn" }
      : server.ok
        ? { label: "ONLINE", cls: "status-green" }
        : { label: "OFFLINE", cls: "status-error" };

  return (
    <div className="status-bar">
      <div className="flex items-center min-w-0 overflow-hidden">
        <span className="status-segment font-bold text-brand-300">~ ORYPHEM</span>
        <span className="status-item">
          <span className={`status-dot ${server.ok ? "status-dot-live" : ""}`} />
          <span className={serverState.cls}>{serverState.label}</span>
        </span>
        <span className="status-item hidden sm:flex">
          uptime <span className="text-text-main tabular-nums">{formatUptime(uptimeVal)}</span>
        </span>
        <span className="status-item hidden sm:flex">
          conn <span className="text-text-main tabular-nums">{connections}</span>
        </span>
      </div>
      <div className="flex items-center">
        <span className="status-item hidden md:flex">port <span className="text-text-main">{port}</span></span>
        <span className="status-item hidden md:flex">theme <span className="text-brand-300">dracula</span></span>
        <span className="status-segment">
          <Clock />
        </span>
      </div>
    </div>
  );
}
