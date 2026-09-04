"use client";

import { useState, useEffect } from "react";
import Card from "./Card";
import { useLiveRefresh } from "@/shared/hooks/useRealtime";

// Render time-ago display (1s tick for live) — hoisted to module scope
// so it doesn't remount on every parent re-render (was inside the component).
function TimeAgo({ timestamp }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!timestamp) return "--";
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  if (isNaN(then)) return "--";
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export default function RequestLogger() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch("/api/usage/request-logs");
      if (res.ok) {
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : []);
      } else {
        setLogs([]);
      }
    } catch (error) {
      console.error("Failed to fetch logs:", error);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Real-time: refetch on every live push (no fixed-interval polling)
  useLiveRefresh(fetchLogs);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Request Logs</h2>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-c-teal-50 px-2.5 py-0.5 text-[11px] font-medium text-c-teal-600 border border-c-teal-600/30">
          <span className="size-1.5 rounded-full bg-c-teal-600 pulse-dot" />
          Live
        </span>
      </div>

      <Card className="overflow-hidden bg-black/5 dark:bg-black/20">
        <div className="p-0 overflow-x-auto max-h-[600px] overflow-y-auto font-mono text-xs">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No logs recorded yet.</div>
          ) : (
            <table className="w-full text-left border-collapse whitespace-nowrap">
              <thead className="sticky top-0 bg-bg-subtle border-b border-[color:var(--md-sys-color-outlineVariant)] z-10">
                <tr>
                  <th className="px-3 py-2 border-r border-border">Time</th>
                  <th className="px-3 py-2 border-r border-border">Model</th>
                  <th className="px-3 py-2 border-r border-border">Provider</th>
                  <th className="px-3 py-2 border-r border-border">Account</th>
                  <th className="px-3 py-2 border-r border-[color:var(--md-sys-color-outlineVariant)] text-right">In</th>
                  <th className="px-3 py-2 border-r border-[color:var(--md-sys-color-outlineVariant)] text-right">Out</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {logs.map((log, i) => {
                  const status = log.status || "-";
                  const isPending = status.includes("PENDING");
                  const isFailed = status.includes("FAILED");

                  return (
                    <tr key={i} className={`hover:bg-primary/5 transition-colors ${isPending ? 'bg-primary/5' : ''}`}>
                      <td className="px-3 py-1.5 border-r border-[color:var(--md-sys-color-outlineVariant)] text-text-muted"><TimeAgo timestamp={log.timestamp} /></td>
                      <td className="px-3 py-1.5 border-r border-[color:var(--md-sys-color-outlineVariant)] font-medium">{log.model}</td>
                      <td className="px-3 py-1.5 border-r border-border">
                        <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-[color:var(--md-sys-color-outlineVariant)] text-[10px] uppercase font-bold">
                          {log.provider}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 border-r border-[color:var(--md-sys-color-outlineVariant)] truncate max-w-[100px]" title={log.account}>{log.account}</td>
                      <td className="px-3 py-1.5 border-r border-[color:var(--md-sys-color-outlineVariant)] text-right text-primary">{log.sent}</td>
                      <td className="px-3 py-1.5 border-r border-[color:var(--md-sys-color-outlineVariant)] text-right text-success">{log.received}</td>
                      <td className={`px-3 py-1.5 font-bold ${status === "OK" ? 'text-success' :
                          isFailed ? 'text-error' :
                            'text-primary animate-pulse'
                        }`}>
                        {status.toUpperCase()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </Card>
      <div className="text-[10px] text-text-muted italic">
        Logs are loaded from the request history database.
      </div>
    </div>
  );
}
