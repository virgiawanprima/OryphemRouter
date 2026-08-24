import { getUsageStats, statsEmitter, getActiveRequests } from "@/lib/usageDb";

export const dynamic = "force-dynamic";

// Full-history aggregation is expensive (see usageRepo.getUsageStats). Recompute
// it on a coarse cadence instead of on every completed request; the per-event
// push only carries the lightweight realtime fields the UI actually re-renders.
const FULL_STATS_REFRESH_MS = 10000;

export async function GET(request) {
  const encoder = new TextEncoder();
  const state = { closed: false, keepalive: null, fullRefresh: null, cachedStats: null };

  const pushLightweight = async () => {
    if (state.closed || !state.cachedStats || !state.controller) return;
    try {
      const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
      const quickStats = { ...state.cachedStats, activeRequests, recentRequests, errorProvider };
      state.controller.enqueue(encoder.encode(`data: ${JSON.stringify(quickStats)}\n\n`));
    } catch {
      cleanup();
    }
  };

  const refreshFullStats = async () => {
    if (state.closed || !state.controller) return;
    try {
      const stats = await getUsageStats();
      state.cachedStats = stats;
      state.controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
    } catch {
      cleanup();
    }
  };

  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    statsEmitter.off("update", pushLightweight);
    statsEmitter.off("pending", pushLightweight);
    clearInterval(state.keepalive);
    clearInterval(state.fullRefresh);
  };

  const stream = new ReadableStream({
    async start(controller) {
      state.controller = controller;

      // Initial: full stats + lightweight realtime fields.
      await refreshFullStats();
      await pushLightweight();

      // Per-event: only the lightweight fields (active/recent/error).
      statsEmitter.on("update", pushLightweight);
      statsEmitter.on("pending", pushLightweight);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 25000);

      // Coarse full-stats recompute so tables/charts still converge.
      state.fullRefresh = setInterval(refreshFullStats, FULL_STATS_REFRESH_MS);

      request.signal.addEventListener("abort", cleanup, { once: true });
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
