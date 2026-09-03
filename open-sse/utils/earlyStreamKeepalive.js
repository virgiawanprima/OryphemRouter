import { recordEarlyKeepaliveBytes } from "./earlyKeepaliveByteBuffer.js";
const ENCODER = new TextEncoder();
const KEEPALIVE_FRAME = ENCODER.encode(": keepalive\n\n");
const OPENAI_KEEPALIVE_FRAME = ENCODER.encode(
  'data: {"id":"chatcmpl-keepalive","object":"chat.completion.chunk","created":0,"model":"keepalive","choices":[{"index":0,"delta":{},"finish_reason":null}]}\n\n'
);
const OPENAI_STARTUP_FRAME = OPENAI_KEEPALIVE_FRAME;
const ANTHROPIC_PING_FRAME = ENCODER.encode('event: ping\ndata: {"type":"ping"}\n\n');
const ERROR_FRAME = ENCODER.encode(
  `event: error
data: ${JSON.stringify({
    error: { message: "Upstream stream failed before completion.", type: "stream_error" }
  })}

`
);
const OPENAI_CHAT_ERROR_FRAME = ENCODER.encode(
  `data: ${JSON.stringify({
    error: { message: "Upstream stream failed before completion.", type: "stream_error" }
  })}

`
);
const OPENAI_RESPONSES_ERROR_FRAME = ENCODER.encode(
  `data: ${JSON.stringify({
    type: "error",
    code: null,
    message: "Upstream stream failed before completion.",
    param: null
  })}

`
);
async function withEarlyStreamKeepalive(handlerPromise, options = {}) {
  const thresholdMs = Math.max(0, options.thresholdMs ?? 2e3);
  const intervalMs = Math.max(250, options.intervalMs ?? 2500);
  const signal = options.signal ?? null;
  const keepaliveFrame = options.keepaliveFrame ?? KEEPALIVE_FRAME;
  const startupFrame = options.startupFrame ?? keepaliveFrame;
  const applicationKeepalive = options.applicationKeepalive && options.applicationKeepalive.intervalMs > 0 ? {
    frame: options.applicationKeepalive.frame,
    intervalMs: Math.max(intervalMs, options.applicationKeepalive.intervalMs)
  } : null;
  const extraHeaders = options.extraHeaders ?? {};
  const errorFrame = options.errorFrame ?? ERROR_FRAME;
  const errorFrameUsesNamedEvent = new TextDecoder().decode(errorFrame).startsWith("event:");
  const correlationId = options.correlationId;
  const frameDecoder = correlationId ? new TextDecoder() : null;
  const recordClientBytes = (chunk) => {
    if (!correlationId || !frameDecoder) return;
    recordEarlyKeepaliveBytes(correlationId, frameDecoder.decode(chunk));
  };
  const settled = handlerPromise.then(
    (response) => ({ status: "fulfilled", response }),
    (error) => ({ status: "rejected", error })
  );
  let timer;
  const raced = await Promise.race([
    settled.then((result) => ({ kind: "settled", result })),
    new Promise((resolve) => {
      timer = setTimeout(() => resolve({ kind: "timeout" }), thresholdMs);
    })
  ]);
  if (timer) clearTimeout(timer);
  if (raced.kind === "settled") {
    const result = raced.result;
    if (result.status === "fulfilled") return result.response;
    throw result.error;
  }
  let stopKeepalive = () => {
  };
  let upstreamReader = null;
  let aborted = false;
  const stream = new ReadableStream({
    async start(controller) {
      let stopped = false;
      let nextApplicationKeepaliveAt = applicationKeepalive ? performance.now() + applicationKeepalive.intervalMs : Number.POSITIVE_INFINITY;
      const interval = setInterval(() => {
        if (stopped) return;
        try {
          const now = performance.now();
          let frame = keepaliveFrame;
          if (applicationKeepalive && now >= nextApplicationKeepaliveAt) {
            frame = applicationKeepalive.frame;
            nextApplicationKeepaliveAt = now + applicationKeepalive.intervalMs;
          }
          controller.enqueue(frame);
          recordClientBytes(frame);
        } catch {
          stopped = true;
          clearInterval(interval);
        }
      }, intervalMs);
      if (typeof interval === "object" && interval !== null && "unref" in interval) {
        interval.unref?.();
      }
      try {
        controller.enqueue(startupFrame);
        recordClientBytes(startupFrame);
      } catch {
      }
      stopKeepalive = () => {
        stopped = true;
        clearInterval(interval);
      };
      const onAbort = () => {
        if (aborted) return;
        aborted = true;
        stopKeepalive();
        upstreamReader?.cancel().catch(() => {
        });
        try {
          controller.close();
        } catch {
        }
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
      try {
        const result = await settled;
        stopKeepalive();
        if (aborted) {
          if (result.status === "fulfilled" && result.response.body) {
            await result.response.body.cancel().catch(() => void 0);
          }
          return;
        }
        if (result.status === "rejected") {
          controller.enqueue(errorFrame);
          recordClientBytes(errorFrame);
        } else {
          const response = result.response;
          const contentType = (response.headers.get("content-type") || "").toLowerCase();
          const isSse = contentType.includes("text/event-stream");
          if (response.body && isSse) {
            upstreamReader = response.body.getReader();
            let bytesForwarded = 0;
            try {
              while (true) {
                const { done, value } = await upstreamReader.read();
                if (done) break;
                if (value) {
                  controller.enqueue(value);
                  bytesForwarded += value.byteLength;
                }
              }
            } catch (readErr) {
              if (bytesForwarded === 0) {
                controller.enqueue(errorFrame);
                recordClientBytes(errorFrame);
              }
            }
          } else {
            const text = response.body ? await response.text().catch(() => "") : "";
            const dataLine = text.trim() || JSON.stringify({ error: { message: "stream_error", type: "stream_error" } });
            const framed = errorFrameUsesNamedEvent ? `event: error
data: ${dataLine}

` : `data: ${dataLine}

`;
            const framedBytes = ENCODER.encode(framed);
            controller.enqueue(framedBytes);
            recordClientBytes(framedBytes);
          }
        }
      } catch {
        if (!aborted) {
          try {
            controller.enqueue(errorFrame);
            recordClientBytes(errorFrame);
          } catch {
          }
        }
      } finally {
        stopKeepalive();
        signal?.removeEventListener("abort", onAbort);
        try {
          controller.close();
        } catch {
        }
      }
    },
    cancel() {
      aborted = true;
      stopKeepalive();
      upstreamReader?.cancel().catch(() => {
      });
    }
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      ...extraHeaders
    }
  });
}
export {
  ANTHROPIC_PING_FRAME,
  OPENAI_CHAT_ERROR_FRAME,
  OPENAI_KEEPALIVE_FRAME,
  OPENAI_RESPONSES_ERROR_FRAME,
  OPENAI_STARTUP_FRAME,
  withEarlyStreamKeepalive
};
