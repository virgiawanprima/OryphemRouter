import { estimateSizeFast } from "../../utils/estimateSize.js";
const ADMISSION_TOOL_SCAN_BUDGET = 64;
function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function asArray(value) {
  return Array.isArray(value) ? value : null;
}
function positiveInt(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  if (!Number.isSafeInteger(value)) {
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(value));
  }
  return value;
}
function saturateCount(n) {
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (!Number.isSafeInteger(n)) {
    return Math.min(Number.MAX_SAFE_INTEGER, Math.floor(n));
  }
  return n;
}
function countTools(layers) {
  const sources = [];
  const seen = /* @__PURE__ */ new Set();
  for (const layer of layers) {
    for (const value of [layer.tools, layer.functions]) {
      const source = asArray(value);
      if (!source || seen.has(source)) continue;
      seen.add(source);
      sources.push(source);
    }
  }
  let entryCount = 0;
  for (const source of sources) {
    if (source.length > ADMISSION_TOOL_SCAN_BUDGET - entryCount) {
      return Number.MAX_SAFE_INTEGER;
    }
    entryCount += source.length;
  }
  let total = 0;
  for (const source of sources) {
    for (let i = 0; i < source.length; i++) {
      const entry = source[i];
      if (isPlainObject(entry)) {
        const declarations = asArray(entry.functionDeclarations);
        if (declarations) {
          total = Math.min(Number.MAX_SAFE_INTEGER, total + saturateCount(declarations.length));
          continue;
        }
      }
      total = Math.min(Number.MAX_SAFE_INTEGER, total + 1);
    }
  }
  return total;
}
function countMessages(layer) {
  const messages = asArray(layer.messages);
  const contents = asArray(layer.contents);
  const inputArr = asArray(layer.input);
  let count = Math.max(
    saturateCount(messages?.length ?? 0),
    saturateCount(contents?.length ?? 0),
    saturateCount(inputArr?.length ?? 0)
  );
  if (count === 0 && typeof layer.input === "string" && layer.input.length > 0) {
    count = 1;
  }
  return count;
}
function readFanout(layer) {
  const direct = positiveInt(layer.n) ?? positiveInt(layer.candidateCount) ?? positiveInt(layer.candidate_count);
  if (direct != null) return direct;
  if (isPlainObject(layer.generationConfig)) {
    return positiveInt(layer.generationConfig.candidateCount) ?? positiveInt(layer.generationConfig.candidate_count);
  }
  return null;
}
function featureLayers(body) {
  const top = isPlainObject(body) ? body : null;
  const wrapped = top && isPlainObject(top.request) ? top.request : null;
  const layers = [];
  if (top) layers.push(top);
  if (wrapped) layers.push(wrapped);
  return layers;
}
function absorbLayer(draft, layer) {
  if (draft.messageCount === 0) {
    draft.messageCount = countMessages(layer);
  }
  if (draft.requestedFanout == null) {
    draft.requestedFanout = readFanout(layer);
  }
  if (draft.streaming == null && "stream" in layer) {
    draft.streaming = layer.stream === true;
  }
}
function resolveStreaming(draftStreaming, context) {
  if (context && "streaming" in context && context.streaming !== void 0) {
    return context.streaming === true;
  }
  return draftStreaming ?? false;
}
function extractAdmissionCostFeatures(body, context) {
  const bodyBytes = estimateSizeFast(body);
  const layers = featureLayers(body);
  const draft = {
    messageCount: 0,
    toolCount: countTools(layers),
    requestedFanout: null,
    streaming: null
  };
  for (const layer of layers) {
    absorbLayer(draft, layer);
  }
  const estimatedInputTokens = bodyBytes > 0 ? Math.min(Number.MAX_SAFE_INTEGER, Math.ceil(bodyBytes / 4)) : 0;
  return {
    bodyBytes,
    estimatedInputTokens,
    messageCount: draft.messageCount,
    toolCount: draft.toolCount,
    requestedFanout: draft.requestedFanout ?? 1,
    streaming: resolveStreaming(draft.streaming, context)
  };
}
export {
  ADMISSION_TOOL_SCAN_BUDGET,
  extractAdmissionCostFeatures
};
