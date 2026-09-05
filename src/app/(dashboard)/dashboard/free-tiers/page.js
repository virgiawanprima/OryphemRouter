"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { Typography } from "antd";
import { useLiveRefresh } from "@/shared/hooks/useRealtime";
import { useNotificationStore } from "@/store/notificationStore";
import { Card, Badge, CardSkeleton } from "@/shared/components";

const TIER_ICONS = {
  kiro: "emoji_events",
  opencode: "code",
  gemini: "psychiatry",
  search: "travel_explore",
};

const TIER_BG_COLORS = {
  kiro: "text-green-600 dark:text-green-400",
  opencode: "text-blue-600 dark:text-blue-400",
  gemini: "text-purple-600 dark:text-purple-400",
  search: "text-amber-600 dark:text-amber-400",
};

const TIER_BORDERS = {
  kiro: "border-green-500/30",
  opencode: "border-blue-500/30",
  gemini: "border-purple-500/30",
  search: "border-amber-500/30",
};

function ProgressBar({ used, total, color = "bg-green-500" }) {
  const pct = total && total !== "∞" ? Math.min((used / total) * 100, 100) : 0;
  return (
    <div className="w-full mt-2">
      <div className="h-2 bg-[color:var(--md-sys-color-surfaceContainerHigh)] border border-[color:var(--md-sys-color-outlineVariant)]">
        <div
          className={`h-full ${color} transition-all duration-500`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-[10px] text-text-muted mt-0.5">
        <span>{typeof used === "number" ? used.toFixed(1) : used} used</span>
        <span>{total === "∞" ? "Unlimited" : `${total} total`}</span>
      </div>
    </div>
  );
}

export default function FreeTiersPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const addNotification = useNotificationStore((s) => s.addNotification);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/free-tiers/stats");
      if (res.ok) {
        const d = await res.json();
        setData(d);
      }
    } catch (e) {
      console.error("Failed to fetch free-tier stats:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // Live push-driven refresh — no fixed-interval polling
  useLiveRefresh(fetchStats);

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const freeTiers = data?.freeTiers || [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between">
        <div>
          <Typography.Title level={1} style={{ fontSize: 20, fontWeight: 500, margin: 0 }} className="flex items-center gap-2 text-text-main">
            <span className="material-symbols-outlined text-primary">local_atm</span>
            Free Tiers
          </Typography.Title>
          <p className="text-sm text-text-muted mt-1">
            Track your free usage across all providers.
            {data?.lastUpdated && (
              <span className="ml-2 text-[10px] opacity-60">
                Last updated: {new Date(data.lastUpdated).toLocaleString()}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-brand-500/10 text-brand-600 dark:text-brand-300">
            <span className="material-symbols-outlined text-[24px]">savings</span>
          </div>
          <div>
            <p className="text-sm font-medium text-text-main">Total Free Budget</p>
            <p className="text-2xl font-bold text-text-main">
              {data?.totalFreeCredits || 0}
              <span className="text-sm font-normal text-text-muted ml-1">credits + unlimited tokens</span>
            </p>
            <p className="text-xs text-text-muted mt-0.5">
              {freeTiers.filter(t => t.type === "credits").length} providers with credit limits
            </p>
          </div>
        </div>
      </Card>

      {/* Provider Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {freeTiers.map((tier, idx) => (
          <Card key={idx} className={`border ${TIER_BORDERS[tier.icon] || "border-border-500"}`}>
            <div className="flex items-start gap-3">
              <div className={`p-2 ${TIER_BG_COLORS[tier.icon] || "text-text-muted"} bg-[color:var(--md-sys-color-surfaceContainerHigh)] rounded-[var(--md-sys-shape-corner-large)] border border-[color:var(--md-sys-color-outlineVariant)]`}>
                <span className="material-symbols-outlined text-[24px]">
                  {TIER_ICONS[tier.icon] || "smart_toy"}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Typography.Title level={3} className="font-semibold text-text-main text-sm" style={{ margin: 0 }}>{tier.provider}</Typography.Title>
                  <Badge variant={tier.type === "unlimited" ? "success" : "warning"} size="sm">
                    {tier.type === "unlimited" ? "Unlimited" : "Limited"}
                  </Badge>
                  <span className="text-[10px] text-text-muted font-mono">{tier.provider}</span>
                </div>
                <p className="text-xs text-text-muted mt-1">{tier.description}</p>
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-text-muted mb-1">
                    <span>{tier.unit}</span>
                    <span>Reset: {tier.reset}</span>
                  </div>
                  {tier.type === "credits" ? (
                    <ProgressBar used={tier.used} total={tier.total} color={tier.icon === "kiro" ? "bg-green-500" : "bg-purple-500"} />
                  ) : (
                    <div className="mt-2 text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">check_circle</span>
                      No usage tracking needed - truly free
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Info Card */}
      <Card className="border border-blue-500/30">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-[var(--radius-brand)] border border-blue-500/30">
            <span className="material-symbols-outlined text-[20px]">info</span>
          </div>
          <div>
            <p className="text-sm font-medium text-text-main">About Free Tiers</p>
            <p className="text-xs text-text-muted mt-1">
              Free tiers are provided by third-party services and subject to their terms.
              Usage is estimated based on actual request volume. Some providers may change
              their free tier policies at any time. This dashboard helps you track and
              maximize your free usage.
            </p>
            <p className="text-xs text-text-muted mt-1">
              Pro tip: Use the "Free Combo" template in Combos page to automatically
              fall through free providers when one runs out of quota.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}