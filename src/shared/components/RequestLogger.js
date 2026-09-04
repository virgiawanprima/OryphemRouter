"use client";

import { useState, useEffect } from "react";
import { Table as AntTable } from "antd";
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
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--md-sys-color-secondaryContainer)]/50 px-2.5 py-0.5 text-[11px] font-medium text-[color:var(--md-sys-color-primary)] border border-[color:var(--md-sys-color-outlineVariant)]">
          <span className="size-1.5 rounded-full bg-[color:var(--md-sys-color-primary)] pulse-dot" />
          Live
        </span>
      </div>

      <Card className="overflow-hidden bg-black/5 dark:bg-black/20">
        <div className="p-0 overflow-hidden">
          {loading && logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">Loading logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-text-muted">No logs recorded yet.</div>
          ) : (
            <AntTable
              rowKey={(_, i) => i}
              dataSource={logs}
              size="small"
              pagination={false}
              className="font-mono text-xs"
              scroll={{ x: 760, y: 560 }}
              rowClassName={(log) => {
                const status = log?.status || "-";
                return status.includes("PENDING") ? "bg-primary/5" : "";
              }}
              columns={[
                {
                  title: "Time",
                  dataIndex: "timestamp",
                  width: 90,
                  render: (ts) => <span className="text-text-muted"><TimeAgo timestamp={ts} /></span>,
                },
                {
                  title: "Model",
                  dataIndex: "model",
                  width: 140,
                  render: (v) => <span className="font-medium">{v}</span>,
                },
                {
                  title: "Provider",
                  dataIndex: "provider",
                  width: 120,
                  render: (v) => (
                    <span className="px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] uppercase font-bold">
                      {v}
                    </span>
                  ),
                },
                {
                  title: "Account",
                  dataIndex: "account",
                  width: 100,
                  ellipsis: true,
                  render: (v) => <span title={v}>{v}</span>,
                },
                {
                  title: "In",
                  dataIndex: "sent",
                  align: "right",
                  width: 70,
                  render: (v) => <span className="text-primary">{v}</span>,
                },
                {
                  title: "Out",
                  dataIndex: "received",
                  align: "right",
                  width: 70,
                  render: (v) => <span className="text-success">{v}</span>,
                },
                {
                  title: "Status",
                  dataIndex: "status",
                  width: 90,
                  render: (v) => {
                    const status = v || "-";
                    const isFailed = status.includes("FAILED");
                    return (
                      <span className={`font-bold ${status === "OK" ? "text-success" :
                        isFailed ? "text-error" : "text-primary animate-pulse"
                      }`}>
                        {status.toUpperCase()}
                      </span>
                    );
                  },
                },
              ]}
            />
          )}
        </div>
      </Card>
      <div className="text-[10px] text-text-muted italic">
        Logs are loaded from the request history database.
      </div>
    </div>
  );
}
