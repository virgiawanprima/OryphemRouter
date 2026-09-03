// ADAPTED STUB — aggregate of handlers/videoGeneration/{googleFlowHandler,deepinfraHandler,leonardoHandler,
// novitaHandler,xaiGrokImagineHandler,adobeFireflyHandler,openai,providers/segmind,runwayHelpers}.ts
// (video provider handler subdir files were not in the handler port scope). Graceful 501 on invoke.

async function handleGoogleFlowVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleGoogleFlowVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleDeepinfraVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleDeepinfraVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleLeonardoVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleLeonardoVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleNovitaVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleNovitaVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleXaiVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleXaiVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleSegmindVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleSegmindVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleAdobeFireflyVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleAdobeFireflyVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

async function handleOpenAIVideoGeneration(args = {}) {
  return { success: false, status: 501, error: "handleOpenAIVideoGeneration not ported to OryphemRouter (stub in utils/omni/videoGenHandlers.js)" };
}

function resolveRunwayPromptImage(body) {
  if (!body || typeof body !== "object") return null;
  return body.image_url || body.imageUrl || body.promptImage || null;
}
function resolveRunwayRatio(body) {
  const r = body && typeof body === "object" ? body.ratio : undefined;
  return typeof r === "string" && /^\d+:\d+$/.test(r) ? r : "16:9";
}
function resolveRunwayDuration(body) {
  const d = body && typeof body === "object" ? body.duration : undefined;
  const n = Number(d);
  return Number.isFinite(n) && n >= 5 && n <= 10 ? Math.round(n) : 5;
}
function resolvePositiveInteger(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}
function extractRunwayFailureMessage(task) {
  return (task && (task.failure || task.error)) || null;
}
async function normalizeRunwayVideoResult(task, _body) {
  if (!task) return { success: false, status: 502, error: "no task result" };
  return { success: true, data: task.output || task };
}

export {
  handleGoogleFlowVideoGeneration,
  handleDeepinfraVideoGeneration,
  handleLeonardoVideoGeneration,
  handleNovitaVideoGeneration,
  handleXaiVideoGeneration,
  handleSegmindVideoGeneration,
  handleAdobeFireflyVideoGeneration,
  handleOpenAIVideoGeneration,
  resolveRunwayPromptImage,
  resolveRunwayRatio,
  resolveRunwayDuration,
  resolvePositiveInteger,
  extractRunwayFailureMessage,
  normalizeRunwayVideoResult,
};
