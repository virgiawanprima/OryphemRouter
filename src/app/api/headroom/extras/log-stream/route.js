import { getInstallLogTail } from "@/lib/headroom/process";

/**
 * SSE stream for headroom extras install/uninstall progress.
 *
 * Replaces the old client-side polling of GET /api/headroom/extras?log=1.
 * This endpoint watches the local install log file on the server (cheap
 * local fs read, no client→server polling) and pushes the tail to the
 * browser whenever it changes, plus a heartbeat so proxies keep it open.
 */

const WATCH_MS = 600; // local fs poll cadence
const HEARTBEAT_MS = 15000;
const IDLE_CLOSE_MS = 120 * 1000; // close if no log change for 2 min (install finished)

export async function GET() {
  let lastTail = "";
  let lastChange = Date.now();
  let watcher = null;
  let heartbeat = null;
  let idleTimer = null;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const push = (data) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch { /* client gone */ }
      };

      // Push current tail immediately.
      lastTail = getInstallLogTail(200);
      push({ log: lastTail, done: false });

      // Server-side watch: read the local file, push only when changed.
      watcher = setInterval(() => {
        const tail = getInstallLogTail(200);
        if (tail !== lastTail) {
          lastTail = tail;
          lastChange = Date.now();
          push({ log: tail, done: false });
        }
      }, WATCH_MS);
      if (watcher.unref) watcher.unref();

      // Heartbeat so proxies don't close the stream.
      heartbeat = setInterval(() => {
        try { controller.enqueue(encoder.encode(": ping\n\n")); } catch { /* ignore */ }
      }, HEARTBEAT_MS);
      if (heartbeat.unref) heartbeat.unref();

      // If the log stops changing (install finished), close the stream.
      idleTimer = setInterval(() => {
        if (Date.now() - lastChange > IDLE_CLOSE_MS) {
          try { controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)); } catch { /* ignore */ }
          cleanup();
          try { controller.close(); } catch { /* ignore */ }
        }
      }, 2000);
      if (idleTimer.unref) idleTimer.unref();
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (watcher) { clearInterval(watcher); watcher = null; }
    if (heartbeat) { clearInterval(heartbeat); heartbeat = null; }
    if (idleTimer) { clearInterval(idleTimer); idleTimer = null; }
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
