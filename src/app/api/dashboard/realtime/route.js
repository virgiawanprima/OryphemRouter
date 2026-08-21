import { statsEmitter, trackPendingRequest, getActiveRequests } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const encoder = new TextEncoder();
  const state = { closed: false, send: null, keepalive: null };

  const stream = new ReadableStream({
    async start(controller) {
      state.send = async () => {
        if (state.closed) return;
        try {
          const activeRequests = await getActiveRequests();
          const { activeRequests: reqs, recentRequests, errorProvider } = activeRequests;
          const stats = { activeRequests: reqs, recentRequests, errorProvider };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(stats)}\n\n`));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      };

      await state.send();

      // Re-push on every stats event (requests, usage, provider/config mutations)
      const onStatsEvent = () => state.send();
      statsEmitter.on("pending", onStatsEvent);
      statsEmitter.on("update", onStatsEvent);
      statsEmitter.on("push", onStatsEvent);
      state.onStatsEvent = onStatsEvent;

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      }, 30000);

      // Next.js does not always invoke ReadableStream.cancel() on client
      // disconnect; the abort signal is the reliable cleanup path.
      const onAbort = () => {
        if (state.onStatsEvent) {
          statsEmitter.off("pending", state.onStatsEvent);
          statsEmitter.off("update", state.onStatsEvent);
          statsEmitter.off("push", state.onStatsEvent);
        }
        clearInterval(state.keepalive);
      };
      request.signal.addEventListener("abort", onAbort, { once: true });
    },

    cancel() {
      state.closed = true;
      if (state.onStatsEvent) {
        statsEmitter.off("pending", state.onStatsEvent);
        statsEmitter.off("update", state.onStatsEvent);
        statsEmitter.off("push", state.onStatsEvent);
      }
      clearInterval(state.keepalive);
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