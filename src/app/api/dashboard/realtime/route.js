import { statsEmitter, getActiveRequests } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const encoder = new TextEncoder();
  const state = {
    closed: false,
    controller: null,
    keepalive: null,
    onStatsEvent: null,
  };

  // Single teardown path: removes the statsEmitter listeners (so a dropped
  // client can't leak them), clears the keepalive timer and closes the
  // controller. Used on abort, stream cancel AND on send/keepalive errors —
  // the previous error path only set closed=true, leaving the listeners
  // attached and the stream hanging open forever.
  const cleanup = () => {
    if (state.closed) return;
    state.closed = true;
    if (state.onStatsEvent) {
      statsEmitter.off("pending", state.onStatsEvent);
      statsEmitter.off("update", state.onStatsEvent);
      statsEmitter.off("push", state.onStatsEvent);
      state.onStatsEvent = null;
    }
    if (state.keepalive) {
      clearInterval(state.keepalive);
      state.keepalive = null;
    }
    if (state.controller) {
      try { state.controller.close(); } catch { /* already closed */ }
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      state.controller = controller;

      const send = async () => {
        if (state.closed) return;
        try {
          const { activeRequests, recentRequests, errorProvider } = await getActiveRequests();
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ activeRequests, recentRequests, errorProvider })}\n\n`));
        } catch {
          // DB read failed — tear the stream down so the client reconnects
          // (with backoff) instead of sitting on a dead, silent connection.
          cleanup();
        }
      };

      await send();

      // Re-push on every stats event (requests, usage, provider/config mutations)
      const onStatsEvent = () => send();
      state.onStatsEvent = onStatsEvent;
      statsEmitter.on("pending", onStatsEvent);
      statsEmitter.on("update", onStatsEvent);
      statsEmitter.on("push", onStatsEvent);

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 30000);

      // Next.js does not always invoke ReadableStream.cancel() on client
      // disconnect; the abort signal is the reliable cleanup path.
      request.signal.addEventListener("abort", cleanup, { once: true });
    },

    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Tell nginx/proxies not to buffer the stream (SSE must flush immediately)
      "X-Accel-Buffering": "no",
    },
  });
}
