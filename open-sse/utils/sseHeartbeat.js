const HEARTBEAT_ENCODER = new TextEncoder();
const OPENAI_RESPONSES_IN_PROGRESS_PAYLOAD = 'data: {"type":"response.in_progress"}\n\n';
const DEFAULT_SSE_HEARTBEAT_INTERVAL_MS = 15e3;
const OPENAI_RESPONSES_IN_PROGRESS_FRAME = HEARTBEAT_ENCODER.encode(
  OPENAI_RESPONSES_IN_PROGRESS_PAYLOAD
);
const HEARTBEAT_SHAPES = {
  COMMENT: "comment",
  ANTHROPIC_PING: "anthropic-ping",
  OPENAI_CHUNK: "openai-chunk",
  OPENAI_RESPONSES_IN_PROGRESS: "openai-responses-in-progress"
};
const DEFAULT_SSE_HEARTBEAT_SHAPE = HEARTBEAT_SHAPES.COMMENT;
function shapeForClientFormat(clientResponseFormat) {
  switch (clientResponseFormat) {
    case "claude":
      return HEARTBEAT_SHAPES.ANTHROPIC_PING;
    case "openai":
      return HEARTBEAT_SHAPES.OPENAI_CHUNK;
    case "openai-responses":
      return HEARTBEAT_SHAPES.OPENAI_RESPONSES_IN_PROGRESS;
    default:
      return HEARTBEAT_SHAPES.COMMENT;
  }
}
function buildHeartbeatPayload(shape, opts = {}) {
  switch (shape) {
    case HEARTBEAT_SHAPES.ANTHROPIC_PING:
      return 'event: ping\ndata: {"type":"ping"}\n\n';
    case HEARTBEAT_SHAPES.OPENAI_RESPONSES_IN_PROGRESS:
      return OPENAI_RESPONSES_IN_PROGRESS_PAYLOAD;
    case HEARTBEAT_SHAPES.OPENAI_CHUNK: {
      const payload = {
        id: opts.chunkId ?? "chatcmpl-keepalive",
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1e3),
        model: opts.chunkModel ?? "keepalive",
        choices: [{ index: 0, delta: {}, finish_reason: null }]
      };
      return `data: ${JSON.stringify(payload)}

`;
    }
    case HEARTBEAT_SHAPES.COMMENT:
    default:
      return `: keepalive ${(/* @__PURE__ */ new Date()).toISOString()}

`;
  }
}
function sseCommentsEnabled() {
  if (typeof process === "undefined") return false;
  const v = process.env.OMNIROUTE_SSE_COMMENTS;
  if (v === void 0 || v === "") return false;
  const normalized = v.trim().toLowerCase();
  return normalized === "on" || normalized === "true" || normalized === "1" || normalized === "yes";
}
function createSseHeartbeatTransform({
  intervalMs = DEFAULT_SSE_HEARTBEAT_INTERVAL_MS,
  signal,
  shape = DEFAULT_SSE_HEARTBEAT_SHAPE,
  chunkId,
  chunkModel
} = {}) {
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    return new TransformStream();
  }
  if (!sseCommentsEnabled() && shape === HEARTBEAT_SHAPES.COMMENT) {
    return new TransformStream();
  }
  let intervalId;
  const stop = () => {
    if (!intervalId) return;
    globalThis.clearInterval(intervalId);
    intervalId = void 0;
  };
  return new TransformStream({
    start(controller) {
      intervalId = globalThis.setInterval(() => {
        if (signal?.aborted) {
          stop();
          return;
        }
        try {
          controller.enqueue(
            HEARTBEAT_ENCODER.encode(buildHeartbeatPayload(shape, { chunkId, chunkModel }))
          );
        } catch {
          stop();
        }
      }, intervalMs);
      if (intervalId && typeof intervalId === "object" && "unref" in intervalId) {
        intervalId.unref?.();
      }
      signal?.addEventListener("abort", stop, { once: true });
    },
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
    flush() {
      stop();
    },
    cancel() {
      stop();
    }
  });
}
export {
  DEFAULT_SSE_HEARTBEAT_INTERVAL_MS,
  DEFAULT_SSE_HEARTBEAT_SHAPE,
  HEARTBEAT_SHAPES,
  OPENAI_RESPONSES_IN_PROGRESS_FRAME,
  createSseHeartbeatTransform,
  shapeForClientFormat,
  sseCommentsEnabled
};
