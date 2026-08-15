import { statsEmitter, trackPendingRequest, getActiveRequests } from "@/lib/db/index";

export const dynamic = "force-dynamic";

export async function GET() {
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

      state.keepalive = setInterval(() => {
        if (state.closed) { clearInterval(state.keepalive); return; }
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          state.closed = true;
          clearInterval(state.keepalive);
        }
      }, 30000);
    },

    cancel() {
      state.closed = true;
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