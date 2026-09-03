"use client";

// Overview — terminal cockpit home page. Hero with server status,
// provider health, usage stats and a live request log tail.

import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { Card, Badge, Button } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useRealtime, LiveBadge, useLiveRefresh } from "@/shared/hooks/useRealtime";

const NAV_QUICK = [
  { href: "/dashboard/endpoint", label: "Endpoint & Key", icon: "api", desc: "API endpoint + local keys" },
  { href: "/dashboard/providers", label: "Providers", icon: "dns", desc: "Manage AI provider connections" },
  { href: "/dashboard/combos", label: "Combos", icon: "layers", desc: "Model fallback chains" },
  { href: "/dashboard/usage", label: "Usage", icon: "bar_chart", desc: "Tokens, costs, requests" },
  { href: "/dashboard/quota", label: "Quota", icon: "data_usage", desc: "Live quota trackers" },
  { href: "/dashboard/cli-tools", label: "CLI Tools", icon: "terminal", desc: "Wire your coding tools" },
];

const TERMINAL_CMD = "$ oryphemrouter --status";

// Terminal-style typewriter for the hero command line. Types once, then sits still:
// the caret pulses only while typing and turns into a dim static block when done.
function useTypewriter(text, speed = 40) {
  const [out, setOut] = useState("");
  const idx = useRef(0);

  useEffect(() => {
    setOut("");
    idx.current = 0;
    const t = setInterval(() => {
      idx.current += 1;
      setOut(text.slice(0, idx.current));
      if (idx.current >= text.length) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [text, speed]);

  return out;
}

export default function OverviewPageClient() {
  const [health, setHealth] = useState(null);
  const [providers, setProviders] = useState({ groups: [], connectionCount: 0, activeCount: 0 });
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState({});
  const [, setTick] = useState(0);
  const healthAtRef = useRef(Date.now());
  const typed = useTypewriter(TERMINAL_CMD);

  // SSE live data — active requests + recent requests + error providers
  const [liveStats, setLiveStats] = useState(null);
  const connState = useRealtime((data) => setLiveStats(data));

  const fetchAll = useCallback(async () => {
    const newErrors = {};
    try {
      const [h, p, s, l] = await Promise.all([
        fetch("/api/health", { cache: "no-store" }),
        fetch("/api/providers/client?page=1&pageSize=500", { cache: "no-store" }),
        fetch("/api/usage/stats?period=24h", { cache: "no-store" }),
        fetch("/api/usage/logs", { cache: "no-store" }),
      ]);
      if (h.ok) { healthAtRef.current = Date.now(); setHealth(await h.json()); } else newErrors.health = "health check failed";
      if (p.ok) {
        const d = await p.json();
        const groups = d.providers || [];
        const conns = groups.flatMap((g) => g.connections || []);
        setProviders({
          groups,
          connectionCount: d.totals?.connectionCount ?? conns.length,
          activeCount: conns.filter((c) => c.isActive !== false).length,
        });
      } else newErrors.providers = "provider data unavailable";
      if (s.ok) setStats(await s.json()); else newErrors.stats = "stats unavailable";
      if (l.ok) {
        const logsData = await l.json();
        const list = Array.isArray(logsData) ? logsData : (logsData.logs || []);
        setLogs(list.slice(0, 12));
      } else newErrors.logs = "log data unavailable";
    } catch (e) {
      newErrors.fetch = e.message;
    }
    setErrors(newErrors);
    setLoading(false);
  }, []);

  // Real-time: initial snapshot + a 1s tick only to advance the uptime clock,
  // then every server push refetches the cards (no fixed-interval polling).
  useEffect(() => {
    fetchAll();
    const tick = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(tick);
  }, [fetchAll]);
  useLiveRefresh(fetchAll);

  const upSec = health?.uptimeSec;
  const elapsedSinceHealth = Math.floor((Date.now() - healthAtRef.current) / 1000);
  const liveUpSec = upSec == null ? upSec : upSec + elapsedSinceHealth;
  const uptimeStr = liveUpSec == null
    ? "--"
    : `${Math.floor(liveUpSec / 3600)}h ${Math.floor((liveUpSec % 3600) / 60)}m ${liveUpSec % 60}s`;

  const online = health?.ok === true;
  const totalTokens = stats?.totalTokens ?? (stats?.totalPromptTokens != null
    ? stats.totalPromptTokens + (stats.totalCompletionTokens || 0) + (stats.totalCachedTokens || 0)
    : (stats?.byProvider
        ? Object.values(stats.byProvider).reduce((a, b) => a + ((b.promptTokens || 0) + (b.completionTokens || 0) + (b.cachedTokens || 0)), 0)
        : 0));
  const totalRequests = stats?.totalRequests ?? (stats?.byProvider ? Object.values(stats.byProvider).reduce((a, b) => a + (b.requests || 0), 0) : 0);

  // Compute stat values explicitly (avoids inline conditional text that a
  // hydration edge case can leave stale in the DOM).
  let serverStatus = "...";
  if (online === true) serverStatus = "Online";
  else if (online === false) serverStatus = "Offline";
  let serverColor = "text-text-subtle";
  if (online === true) serverColor = "text-c-green";
  else if (online === false) serverColor = "text-c-red-600";
  const connValue = loading ? "..." : String(providers.connectionCount);
  const connNote = loading ? "loading" : `${providers.activeCount} active`;
  const tokensValue = loading ? "..." : Number.isFinite(totalTokens) ? totalTokens.toLocaleString() : "--";

  const statCards = [
    { label: "Server", value: serverStatus, color: serverColor, icon: "dns", note: `uptime ${uptimeStr}` },
    { label: "Connections", value: connValue, color: "text-c-purple", icon: "link", note: connNote },
    { label: "Active requests", value: liveStats?.activeRequests ?? 0, color: "text-c-cyan", icon: "swap_vert", note: "live via SSE" },
    { label: "Tokens (24h)", value: tokensValue, color: "text-c-purple", icon: "toll", note: "est. token flow" },
  ];

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {Object.keys(errors).length > 0 && (
        <div className="border border-c-red-600/30 bg-c-red-50/5 rounded-[12px] p-3">
          <p className="text-[13px] text-c-red-600 font-medium">Data fetch error</p>
          <div className="mt-1 text-[13px] text-c-red-800">
            {Object.entries(errors).map(([k, v]) => (
              <div key={k}>{k}: {v}</div>
            ))}
          </div>
        </div>
      )}

      {/* Hero */}
      <Card padding="md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[22px] font-medium text-text-main">Overview</h1>
            <p className="mt-0.5 text-[13px] text-c-purple">AI Router Cockpit: real-time provider &amp; usage monitoring</p>
            <div className="mt-2">
              <p className="flex items-center gap-0.5 font-mono text-[13px] text-c-green">
                {typed}
                <span aria-hidden="true" className={`inline-block h-4 w-[7px] rounded-[1px] bg-c-green ${typed.length < TERMINAL_CMD.length ? "animate-cursor-blink" : "animate-cursor-blink opacity-60"}`} />
              </p>
              <p className="mt-1 text-[13px] text-text-muted">monitor your AI router status, providers, and usage.</p>
            </div>
          </div>
          <LiveBadge state={connState} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link href="/dashboard/endpoint">
            <Button size="sm" variant="primary">Manage endpoint</Button>
          </Link>
          <Link href="/dashboard/providers">
            <Button size="sm" variant="secondary">Connect provider</Button>
          </Link>
        </div>
      </Card>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} padding="sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[13px] text-text-muted">{s.label}</p>
                <p className={`mt-1 text-[22px] font-medium tabular-nums ${s.color}`}>{s.value}</p>
                <p className="mt-1 text-[13px] text-text-muted">{s.note}</p>
              </div>
              <span className="material-symbols-outlined text-[20px] text-c-blue-600">{s.icon}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* Providers health + quick nav */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Card padding="sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] font-medium text-text-main">Provider health</h2>
            <Link href="/dashboard/providers" className="text-[13px] text-c-blue-600 hover:underline">View all</Link>
          </div>
          {providers.groups.length === 0 ? (
            <p className="text-[13px] text-text-muted">Connect your first provider</p>
          ) : (
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {providers.groups.slice(0, 20).map((g) => {
                const conns = g.connections || [];
                const active = conns.filter((c) => c.isActive !== false);
                const state = conns.length === 0
                  ? { label: "Free", cls: "text-c-teal-600" }
                  : active.length > 0
                    ? { label: `${active.length} up`, cls: "text-c-teal-600" }
                    : { label: "Down", cls: "text-c-red-600" };
                return (
                  <div key={g.provider} className="flex items-center gap-2 px-2 py-1 rounded-[8px] hover:bg-surface-2 transition-colors">
                    <ProviderIcon
                      src={`/providers/${g.provider}.png`}
                      alt={g.provider}
                      size={16}
                      className="rounded object-contain size-[16px]"
                      fallbackText={g.provider.slice(0, 2).toUpperCase()}
                    />
                    <span className="text-[13px] text-text-main capitalize truncate">{g.provider}</span>
                    <span className="ml-auto text-[13px] text-text-muted">
                      {conns.length} key{conns.length !== 1 ? "s" : ""}
                    </span>
                    <span className={`text-[13px] ${state.cls}`}>{state.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <Card padding="sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[18px] font-medium text-text-main">Quick access</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NAV_QUICK.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className="group flex items-center gap-2.5 px-3 py-2.5 rounded-[8px] border border-transparent hover:border-c-blue-600/30 hover:bg-c-blue-50/5 transition-all"
              >
                <span className="material-symbols-outlined text-[18px] text-c-blue-600">{n.icon}</span>
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-text-main truncate">{n.label}</p>
                  <p className="text-[13px] text-text-muted truncate">{n.desc}</p>
                </div>
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Log tail */}
      <Card padding="sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[18px] font-medium text-text-main">Request logs</h2>
          <Link href="/dashboard/usage" className="text-[13px] text-c-blue-600 hover:underline">View all</Link>
        </div>
        {logs.length === 0 ? (
          <p className="text-[13px] text-text-muted">Send your first request to see logs here</p>
        ) : (
          <div className="text-[13px] max-h-60 overflow-y-auto">
            {logs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-1 border-b border-border-subtle last:border-b-0 hover:bg-surface-2 transition-colors">
                <span className="text-text-muted shrink-0">{(() => { const ts = log.timestamp || log.createdAt; return ts ? new Date(ts).toLocaleTimeString("en-GB") : "--:--:--"; })()}</span>
                <span className={log.status === "error" ? "text-c-red-600" : "text-c-teal-600"}>{log.status || "200"}</span>
                <span className="text-c-blue-600 truncate">{log.provider || "?"}</span>
                <span className="text-text-muted truncate flex-1">{log.model || ""}</span>
                {typeof log.tokens === "number" && <span className="text-c-teal-600 shrink-0">{log.tokens}t</span>}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
