import { createHash } from "node:crypto";
const MAX_INFLIGHT = 1e3;
const DEFAULT_DEDUP_CONFIG = {
  enabled: true,
  maxTemperatureForDedup: 0.1,
  timeoutMs: 6e4
};
const inflight = /* @__PURE__ */ new Map();
function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function extractPromptContent(body) {
  if (body.messages !== void 0) return body.messages;
  if (body.contents !== void 0) return body.contents;
  if (body.input !== void 0) return body.input;
  const request = asRecord(body.request);
  if (request && request.contents !== void 0) {
    return request.contents;
  }
  const conversationState = asRecord(body.conversationState);
  if (conversationState) {
    const currentMessage = asRecord(conversationState.currentMessage);
    const userInputMessage = asRecord(currentMessage?.userInputMessage);
    if (userInputMessage || conversationState.history !== void 0) {
      return {
        content: userInputMessage?.content ?? null,
        history: conversationState.history ?? null
      };
    }
  }
  return null;
}
function extractSystemContent(body) {
  if (body.system !== void 0) return body.system;
  if (body.instructions !== void 0) return body.instructions;
  if (body.systemInstruction !== void 0) return body.systemInstruction;
  const request = asRecord(body.request);
  if (request && request.systemInstruction !== void 0) {
    return request.systemInstruction;
  }
  return null;
}
function computeRequestHash(requestBody) {
  const body = requestBody;
  const canonical = {
    model: body.model ?? null,
    messages: extractPromptContent(body),
    system: extractSystemContent(body),
    temperature: typeof body.temperature === "number" ? body.temperature : 1,
    tools: body.tools ?? null,
    tool_choice: body.tool_choice ?? null,
    max_tokens: body.max_tokens ?? null,
    response_format: body.response_format ?? null,
    top_p: body.top_p ?? null,
    frequency_penalty: body.frequency_penalty ?? null,
    presence_penalty: body.presence_penalty ?? null
  };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 16);
}
function shouldDeduplicate(requestBody, config = DEFAULT_DEDUP_CONFIG) {
  if (!config.enabled) return false;
  const body = requestBody;
  if (body.stream === true) return false;
  const temperature = typeof body.temperature === "number" ? body.temperature : 1;
  if (temperature > config.maxTemperatureForDedup) return false;
  return true;
}
async function deduplicate(hash, fn, config = DEFAULT_DEDUP_CONFIG) {
  if (!config.enabled) {
    return { result: await fn(), wasDeduplicated: false, hash };
  }
  const existing = inflight.get(hash);
  if (existing) {
    const result = await existing;
    return { result, wasDeduplicated: true, hash };
  }
  if (inflight.size >= MAX_INFLIGHT) {
    const oldestKey = inflight.keys().next().value;
    if (oldestKey !== void 0) inflight.delete(oldestKey);
  }
  let resolve;
  let reject;
  const sharedPromise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  inflight.set(hash, sharedPromise);
  const timer = setTimeout(() => {
    if (inflight.get(hash) === sharedPromise) inflight.delete(hash);
  }, config.timeoutMs);
  try {
    const result = await fn();
    resolve(result);
    return { result, wasDeduplicated: false, hash };
  } catch (err) {
    reject(err);
    throw err;
  } finally {
    clearTimeout(timer);
    if (inflight.get(hash) === sharedPromise) inflight.delete(hash);
  }
}
function getInflightCount() {
  return inflight.size;
}
function getInflightHashes() {
  return [...inflight.keys()];
}
function clearInflight() {
  inflight.clear();
}
export {
  DEFAULT_DEDUP_CONFIG,
  clearInflight,
  computeRequestHash,
  deduplicate,
  getInflightCount,
  getInflightHashes,
  shouldDeduplicate
};
