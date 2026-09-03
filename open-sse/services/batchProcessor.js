import { v4 as uuidv4 } from "uuid";
import {
  countBatchItemCheckpoints,
  createFile,
  deleteFile,
  ensureBatchItemCheckpoints,
  getApiKeyById,
  getBatch,
  getFileContent,
  getPendingBatches,
  getTerminalBatches,
  listBatchItemCheckpoints,
  listFiles,
  markBatchItemError,
  markBatchItemProcessing,
  markBatchItemResult,
  updateBatch
} from "../utils/omni/localDb.js";
import { dispatch } from "../utils/omni/batchDispatch.js";
import { DEFAULT_BATCH_EXPIRATION_SECONDS } from "../utils/omni/batchConstants.js";
import { log } from "../utils/log.js";
let isProcessing = false;
let pollInterval = null;
const activeProcesses = /* @__PURE__ */ new Set();
const activeBatches = /* @__PURE__ */ new Set();
const DEFAULT_BATCH_WINDOW_SECONDS = 24 * 60 * 60;
const BATCH_RETRY_DURATION_MS = Number.parseInt(process.env.BATCH_RETRY_DURATION_MS ?? "", 10) || 24 * 60 * 60 * 1e3;
const BATCH_BACKOFF_BASE_MS = Number.parseInt(process.env.BATCH_BACKOFF_BASE_MS ?? "", 10) || 5e3;
const BATCH_BACKOFF_MAX_MS = Number.parseInt(process.env.BATCH_BACKOFF_MAX_MS ?? "", 10) || 36e5;
const BATCH_MAX_CONCURRENT = Number.parseInt(process.env.BATCH_MAX_CONCURRENT ?? "", 10) || 1;
function initBatchProcessor() {
  if (pollInterval) return pollInterval;
  log.info("BATCH", "[BATCH] Initializing batch processor polling...");
  pollInterval = setInterval(async () => {
    if (isProcessing) return;
    try {
      isProcessing = true;
      await processPendingBatches();
    } catch (err) {
      log.error("BATCH", "[BATCH] Polling error:", err);
    } finally {
      isProcessing = false;
    }
  }, 1e4).unref();
  return pollInterval;
}
function stopBatchProcessor() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    log.info("BATCH", "[BATCH] Stopped batch processor polling.");
  }
}
async function processPendingBatches() {
  const pending = getPendingBatches();
  for (const batch of pending) {
    if (batch.status === "in_progress" || batch.status === "finalizing") {
      if (!activeBatches.has(batch.id)) {
        recoverStaleBatch(batch);
      }
    }
  }
  const remaining = getPendingBatches();
  let activeCount = activeBatches.size;
  for (const batch of remaining) {
    if (batch.status === "validating") {
      if (activeCount >= BATCH_MAX_CONCURRENT) {
        log.info(
          "BATCH",
          `[BATCH] Concurrency limit ${BATCH_MAX_CONCURRENT} reached, deferring batch ${batch.id}`
        );
        continue;
      }
      activeCount++;
      await startBatch(batch);
    } else if (batch.status === "cancelling") {
      await cancelBatch(batch);
    }
  }
  await cleanupExpiredBatches();
}
function recoverStaleBatch(batch) {
  const checkpointCount = countBatchItemCheckpoints(batch.id);
  const hasPotentialExternalEffects = batch.requestCountsTotal > 0 || batch.requestCountsCompleted > 0 || batch.requestCountsFailed > 0 || batch.status === "finalizing";
  if (checkpointCount === 0 && hasPotentialExternalEffects) {
    log.warn(
      "BATCH",
      `[BATCH] Stale batch ${batch.id} has no item checkpoints; failing instead of replaying provider calls`
    );
    failBatch(
      batch.id,
      "Cannot safely recover stale batch because item checkpoints are unavailable; create a new batch to retry intentionally."
    );
    return;
  }
  log.info("BATCH", `[BATCH] Recovering stale batch ${batch.id} (${batch.status}) \u2192 validating`);
  if (batch.outputFileId) {
    deleteFile(batch.outputFileId);
  }
  if (batch.errorFileId) {
    deleteFile(batch.errorFileId);
  }
  updateBatch(batch.id, {
    status: "validating",
    inProgressAt: null,
    finalizingAt: null,
    outputFileId: null,
    errorFileId: null,
    ...checkpointCount === 0 ? {
      requestCountsCompleted: 0,
      requestCountsFailed: 0
    } : {}
  });
}
function parseBatchWindowSeconds(window) {
  if (!window) return DEFAULT_BATCH_WINDOW_SECONDS;
  const match = /^(\d+)([hdm])$/.exec(window);
  if (!match) return DEFAULT_BATCH_WINDOW_SECONDS;
  const value = Number.parseInt(match[1], 10);
  const unit = match[2];
  if (unit === "h") return value * 3600;
  if (unit === "d") return value * 86400;
  if (unit === "m") return value * 60;
  return DEFAULT_BATCH_WINDOW_SECONDS;
}
function getBatchOutputExpiresAt(batch) {
  if (batch.outputExpiresAfterAnchor === "created_at" && typeof batch.outputExpiresAfterSeconds === "number" && batch.outputExpiresAfterSeconds > 0) {
    return batch.createdAt + batch.outputExpiresAfterSeconds;
  }
  const completionTime = batch.completedAt || batch.failedAt || batch.cancelledAt || batch.expiredAt;
  if (!completionTime) return null;
  return completionTime + DEFAULT_BATCH_EXPIRATION_SECONDS;
}
function resolveBatchApiKeyValue(batch, apiKeyRow) {
  if (typeof apiKeyRow?.key === "string" && apiKeyRow.key.length > 0) {
    return apiKeyRow.key;
  }
  if (batch.apiKeyId === "env-key") {
    return process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY || null;
  }
  return null;
}
function parseBatchItems(content, batchEndpoint) {
  const lines = content.toString().split("\n").map((line) => line.trim()).filter(Boolean);
  const items = [];
  for (const [index, line] of lines.entries()) {
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      return { items: null, error: `Line ${index + 1} is not valid JSON` };
    }
    const method = String(parsed.method || "POST").toUpperCase();
    const url = parsed.url;
    const body = parsed.body;
    if (method !== "POST") {
      return {
        items: null,
        error: `Line ${index + 1} uses unsupported method ${method}; only POST is supported`
      };
    }
    if (url !== batchEndpoint) {
      return {
        items: null,
        error: `Line ${index + 1} url ${String(url)} does not match batch endpoint ${batchEndpoint}`
      };
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { items: null, error: `Line ${index + 1} must include a JSON object body` };
    }
    items.push({
      body,
      customId: typeof parsed.custom_id === "string" ? parsed.custom_id : null,
      lineNumber: index + 1,
      method: "POST",
      url: batchEndpoint
    });
  }
  return { items, error: null };
}
async function cleanupExpiredBatches() {
  try {
    const now2 = Math.floor(Date.now() / 1e3);
    const batches = getTerminalBatches();
    for (const batch of batches) {
      const completionTime = batch.completedAt || batch.failedAt || batch.cancelledAt || batch.expiredAt;
      const inputExpiresAt = completionTime && batch.inputFileId ? completionTime + DEFAULT_BATCH_EXPIRATION_SECONDS : null;
      const outputExpiresAt = getBatchOutputExpiresAt(batch);
      if (batch.inputFileId && inputExpiresAt && now2 > inputExpiresAt) {
        deleteFile(batch.inputFileId);
      }
      if (batch.outputFileId && outputExpiresAt && now2 > outputExpiresAt) {
        deleteFile(batch.outputFileId);
      }
      if (batch.errorFileId && outputExpiresAt && now2 > outputExpiresAt) {
        deleteFile(batch.errorFileId);
      }
    }
    for (const batch of getPendingBatches()) {
      if (batch.status === "validating") {
        const windowSeconds = parseBatchWindowSeconds(batch.completionWindow);
        if (now2 - batch.createdAt > windowSeconds) {
          updateBatch(batch.id, { status: "expired", expiredAt: now2 });
        }
      }
    }
    const allFiles = listFiles({ order: "asc", limit: 100 });
    for (const file of allFiles) {
      if (file.purpose === "batch" && now2 - file.createdAt > DEFAULT_BATCH_EXPIRATION_SECONDS) {
        deleteFile(file.id);
      }
    }
  } catch (err) {
    log.error("BATCH", "[BATCH] Cleanup error:", err);
  }
}
async function startBatch(batch) {
  log.info("BATCH", `[BATCH] Starting batch ${batch.id}`);
  const content = getFileContent(batch.inputFileId);
  if (!content) {
    failBatch(batch.id, "Input file content not found");
    return;
  }
  try {
    const parsedItems = parseBatchItems(content, batch.endpoint);
    if (parsedItems.error) {
      const lines = content.toString().split("\n").map((line) => line.trim()).filter(Boolean);
      updateBatch(batch.id, {
        requestCountsTotal: lines.length,
        requestCountsFailed: lines.length
        // All failed due to validation error
      });
      failBatch(batch.id, parsedItems.error);
      return;
    }
    const total = parsedItems.items.length;
    log.info("BATCH", `[BATCH] Batch ${batch.id} contains (${total} items)`);
    ensureBatchItemCheckpoints(batch.id, parsedItems.items);
    updateBatch(batch.id, {
      status: "in_progress",
      inProgressAt: Math.floor(Date.now() / 1e3),
      requestCountsTotal: total
    });
    activeBatches.add(batch.id);
    const p = processBatchItems(batch, parsedItems.items).catch((err) => {
      log.error("BATCH", `[BATCH] Critical error in processBatchItems for ${batch.id}:`, err);
      failBatch(batch.id, String(err));
    });
    activeProcesses.add(p);
    p.finally(() => {
      activeProcesses.delete(p);
      activeBatches.delete(batch.id);
    });
  } catch (err) {
    log.error("BATCH", `[BATCH] Error starting batch ${batch.id}:`, err);
    failBatch(batch.id, err instanceof Error ? err.message : String(err));
  }
}
let prevHeaders = null;
let prevHeadersTimestamp = 0;
const HEADERS_CACHE_TTL_MS = 6e4;
async function processBatchItems(batch, items) {
  const state = createBatchState(batch);
  const checkpoints = new Map(
    listBatchItemCheckpoints(batch.id).map((checkpoint) => [checkpoint.lineNumber, checkpoint])
  );
  const apiKey = await resolveApiKey(batch);
  for (const item of items) {
    if (isBatchCancelled(batch.id)) break;
    const checkpoint = checkpoints.get(item.lineNumber);
    if (checkpoint && applyRecoveredCheckpoint(batch.id, item, checkpoint, state)) {
      maybePersistProgress(batch.id, state);
      continue;
    }
    const cachedHeaders = prevHeaders && Date.now() - prevHeadersTimestamp < HEADERS_CACHE_TTL_MS ? prevHeaders : null;
    if (cachedHeaders) {
      const delay = maybeThrottle(cachedHeaders);
      if (delay) {
        await sleep(delay);
      }
    }
    markBatchItemProcessing(batch.id, item);
    try {
      const response = await processSingleItemWithRetry(item, apiKey);
      let responseBody;
      try {
        responseBody = await response.clone().json();
      } catch {
        responseBody = await response.text();
      }
      const wrapped = {
        id: `req_${uuidv4().replaceAll("-", "")}`,
        custom_id: item.customId ?? null,
        response: {
          status_code: response.status,
          body: responseBody
        }
      };
      markBatchItemResult(batch.id, item, wrapped);
      state.results.push(wrapped);
      applyItemResult(state, response.status, responseBody);
      prevHeaders = response.headers;
      prevHeadersTimestamp = Date.now();
    } catch (exception) {
      const error = { custom_id: item.customId ?? null, error: String(exception) };
      markBatchItemError(batch.id, item, error);
      state.errors.push(error);
      state.failed++;
      prevHeaders = null;
      prevHeadersTimestamp = 0;
    }
    maybePersistProgress(batch.id, state);
  }
  return finalizeBatch(batch.id, state.results, state.errors);
}
function applyRecoveredCheckpoint(batchId, item, checkpoint, state) {
  if (checkpoint.status === "completed" && checkpoint.result) {
    state.results.push(checkpoint.result);
    applyItemResult(
      state,
      checkpoint.result.response?.status_code ?? 500,
      checkpoint.result.response?.body
    );
    return true;
  }
  if (checkpoint.status === "errored" && checkpoint.error) {
    state.errors.push(checkpoint.error);
    state.failed++;
    return true;
  }
  if (checkpoint.status === "processing") {
    const error = {
      custom_id: item.customId ?? null,
      error: "Batch item was interrupted before its provider response was recorded; it was not replayed to avoid duplicate provider work."
    };
    markBatchItemError(batchId, item, error);
    state.errors.push(error);
    state.failed++;
    return true;
  }
  return false;
}
function isBatchCancelled(batchId) {
  const current = getBatch(batchId);
  return !current || current.status === "cancelling" || current.status === "cancelled";
}
async function resolveApiKey(batch) {
  const apiKeyRow = batch.apiKeyId ? await getApiKeyById(batch.apiKeyId) : null;
  return resolveBatchApiKeyValue(batch, apiKeyRow);
}
async function processSingleItemWithRetry(item, apiKey) {
  const MAX_RETRY_DURATION_MS = BATCH_RETRY_DURATION_MS;
  const maxRetries = 200;
  const retryStartedAt = Date.now();
  let response = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (response) {
      const delay = maybeThrottle(response.headers);
      if (delay) {
        await sleep(delay);
      }
    }
    response = await processSingleItem(item, apiKey);
    if ((response.status === 429 || response.status === 502 || response.status === 504) && attempt < maxRetries) {
      if (Date.now() - retryStartedAt >= MAX_RETRY_DURATION_MS) {
        log.warn(
          "BATCH",
          `[BATCH] Item ${item.customId ?? "(no id)"} exceeded 24h retry window after ${attempt} attempts \u2014 giving up`
        );
        return response;
      }
      const delay = getRetryDelayMs(response.headers) ?? getBackoffDelayMs(attempt);
      await sleep(delay);
      continue;
    }
    return response;
  }
}
const BATCH_ITEM_DISPATCH_TIMEOUT_MS = 12e4;
function withItemDispatchTimeout(promise, timeoutMs, label) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
      timeoutMs
    );
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
async function processSingleItem(item, apiKey) {
  const body = buildRequestBody(item);
  return withItemDispatchTimeout(
    dispatch.dispatchBatchApiRequest({
      endpoint: item.url,
      body,
      apiKey
    }),
    BATCH_ITEM_DISPATCH_TIMEOUT_MS,
    `Batch item dispatch (${item.url})`
  );
}
function buildRequestBody(item) {
  const isChatEndpoint = ![
    "/v1/embeddings",
    "/v1/moderations",
    "/v1/images/generations",
    "/v1/images/edits",
    "/v1/videos",
    "/v1/videos/generations"
  ].includes(item.url);
  return {
    ...item.body,
    ...isChatEndpoint ? { stream: false } : {}
  };
}
function getBackoffDelayMs(attempt) {
  const baseMs = BATCH_BACKOFF_BASE_MS;
  const maxMs = BATCH_BACKOFF_MAX_MS;
  const exp = Math.min(maxMs, baseMs * 2 ** attempt);
  const jitterFactor = 1 + (Math.random() * 0.4 - 0.2);
  return Math.floor(exp * jitterFactor);
}
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}
function getRetryDelayMs(headers) {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (!Number.isNaN(seconds)) {
      return seconds * 1e3;
    }
    const date = new Date(retryAfter).getTime();
    if (!Number.isNaN(date)) {
      return Math.max(0, date - Date.now());
    }
  }
  return null;
}
function maybeThrottle(headers) {
  const remainingReq = toNumber(headers.get("x-ratelimit-remaining-req-minute"));
  const limitReq = toNumber(headers.get("x-ratelimit-limit-req-minute"));
  const remainingTokens = toNumber(headers.get("x-ratelimit-remaining-tokens-minute"));
  const cost = toNumber(headers.get("x-ratelimit-tokens-query-cost"));
  let pressures = [];
  if (remainingReq !== null && limitReq !== null) {
    if (limitReq > 0) {
      pressures.push(remainingReq / limitReq);
    }
  }
  if (remainingTokens !== null && cost !== null) {
    if (remainingTokens + cost > 0) {
      pressures.push(remainingTokens / (remainingTokens + cost));
    }
  }
  if (pressures.length === 0) {
    log.info("BATCH", "[BATCH] Throttle check - no rate-limit headers present");
    return null;
  } else {
    const tokenTotal = remainingTokens != null && cost != null ? remainingTokens + cost : null;
    log.info(
      "BATCH",
      `[BATCH] Throttle check - Request pressure: ${remainingReq ?? "n/a"}/${limitReq ?? "n/a"}, Token pressure: ${remainingTokens ?? "n/a"}/${tokenTotal ?? "n/a"}`
    );
  }
  const pressureRemaining = Math.min(...pressures);
  const delay = throttleDelay(pressureRemaining);
  if (delay !== null) {
    log.info(
      "BATCH",
      `[BATCH] Throttling next request with delay of ${Math.round(delay)}ms (pressure remaining: ${(pressureRemaining * 100).toFixed(2)}%)`
    );
  }
  return delay;
}
function throttleDelay(pressure) {
  if (pressure >= 0.2) return null;
  const severity = (0.2 - pressure) / 0.2;
  const delay = Math.pow(severity, 2) * 3e4;
  return 200 + delay + Math.random() * 1e3;
}
const toNumber = (v) => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
function createBatchState(batch) {
  return {
    results: [],
    errors: [],
    completed: 0,
    failed: 0,
    tokens: {
      input: 0,
      output: 0,
      reasoning: 0
    },
    model: batch.model || null
  };
}
function applyItemResult(state, statusCode, body) {
  if (statusCode >= 400 || body?.error) {
    state.failed++;
  } else {
    state.completed++;
    if (body?.usage) {
      state.tokens.input += body.usage.prompt_tokens || body.usage.input_tokens || 0;
      state.tokens.output += body.usage.completion_tokens || body.usage.output_tokens || 0;
      state.tokens.reasoning += body.usage.completion_tokens_details?.reasoning_tokens || 0;
    }
    if (!state.model && body?.model) {
      state.model = body.model;
    }
  }
}
function maybePersistProgress(batchId, state) {
  try {
    updateBatch(batchId, {
      requestCountsCompleted: state.completed,
      requestCountsFailed: state.failed,
      model: state.model
    });
  } catch (err) {
    log.error("BATCH", `[BATCH] Failed to persist progress for ${batchId}:`, err);
  }
  const total = state.completed + state.failed;
  if (total % 50 !== 0) return;
  try {
    updateBatch(batchId, {
      requestCountsCompleted: state.completed,
      requestCountsFailed: state.failed,
      model: state.model,
      usage: {
        input_tokens: state.tokens.input,
        output_tokens: state.tokens.output,
        total_tokens: state.tokens.input + state.tokens.output,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: state.tokens.reasoning }
      }
    });
  } catch (err) {
    log.error("BATCH", `[BATCH] Failed to persist extended progress for ${batchId}:`, err);
  }
}
async function finalizeBatch(batchId, results, itemsWithErrors) {
  const current = getBatch(batchId);
  if (handleCancellation(batchId, current)) return;
  markFinalizing(batchId);
  const successes = results.filter(
    (r) => typeof r.response?.status_code === "number" && r.response.status_code < 400 && !r.response.body?.error
  );
  const failuresFromResults = results.filter(
    (r) => typeof r.response?.status_code === "number" && r.response.status_code >= 400 || r.response?.body?.error
  );
  const processingErrors = itemsWithErrors || [];
  const completedCount = successes.length;
  const failedCount = failuresFromResults.length + processingErrors.length;
  const totalCount = current?.requestCountsTotal || completedCount + failedCount;
  let inputTokens = 0;
  let outputTokens = 0;
  let reasoningTokens = 0;
  for (const r of results) {
    try {
      const body = r.response?.body;
      if (!body) continue;
      const usage = body.usage || {};
      inputTokens += usage.prompt_tokens ?? usage.input_tokens ?? usage.total_tokens ?? 0;
      outputTokens += usage.completion_tokens ?? 0;
      reasoningTokens += usage.completion_tokens_details?.reasoning_tokens ?? 0;
    } catch (err) {
      log.error("BATCH", "Failed to aggregate usage for batch", batchId, err);
    }
  }
  const model = results.find((r) => r.response?.body?.model)?.response?.body?.model || current?.model || null;
  const completionTime = now();
  try {
    updateBatch(batchId, {
      requestCountsTotal: totalCount,
      requestCountsCompleted: completedCount,
      requestCountsFailed: failedCount,
      model,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: inputTokens + outputTokens,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: reasoningTokens }
      },
      // also set completedAt so file expiration calculation can use it
      completedAt: completionTime
    });
  } catch (err) {
    log.error("BATCH", `[BATCH] Failed to persist final progress for ${batchId}:`, err);
  }
  const batchForFiles = getBatch(batchId);
  const outputFileId = createSuccessFile(batchId, batchForFiles, results);
  const errorFileId = createErrorFile(batchId, batchForFiles, results, itemsWithErrors);
  completeBatch(batchId, outputFileId, errorFileId);
}
function handleCancellation(batchId, current) {
  if (!current) return true;
  if (current.status === "cancelling") {
    updateBatch(batchId, {
      status: "cancelled",
      cancelledAt: now()
    });
    return true;
  }
  return current.status === "cancelled";
}
function markFinalizing(batchId) {
  updateBatch(batchId, {
    status: "finalizing",
    finalizingAt: now()
  });
}
function completeBatch(batchId, outputFileId, errorFileId) {
  updateBatch(batchId, {
    status: "completed",
    completedAt: now(),
    outputFileId,
    errorFileId
  });
  const b = getBatch(batchId);
  const total = b?.requestCountsTotal ?? "?";
  log.info("BATCH", `[BATCH] Completed batch ${batchId} (${total} items)`);
}
function now() {
  return Math.floor(Date.now() / 1e3);
}
function createSuccessFile(batchId, current, results) {
  const successes = results.filter((r) => r.response.status_code < 400 && !r.response.body?.error);
  if (successes.length === 0) return null;
  const content = toJsonl(successes);
  const file = createFile({
    bytes: Buffer.byteLength(content),
    filename: `batch_${batchId}_output.jsonl`,
    purpose: "batch_output",
    content: Buffer.from(content),
    apiKeyId: current?.apiKeyId,
    expiresAt: getBatchOutputExpiresAt(current)
  });
  return file.id;
}
function createErrorFile(batchId, current, results, itemsWithErrors) {
  const failures = results.filter((r) => r.response.status_code >= 400 || r.response.body?.error);
  const processErrors = itemsWithErrors.map((e) => ({
    id: `batch_req_${uuidv4().replaceAll("-", "")}`,
    custom_id: e.custom_id,
    response: null,
    error: { message: e.error, type: "batch_process_error" }
  }));
  const allFailures = [...failures, ...processErrors];
  if (allFailures.length === 0) return null;
  const content = toJsonl(allFailures);
  const file = createFile({
    bytes: Buffer.byteLength(content),
    filename: `batch_${batchId}_error.jsonl`,
    purpose: "batch_output",
    content: Buffer.from(content),
    apiKeyId: current?.apiKeyId,
    expiresAt: getBatchOutputExpiresAt(current)
  });
  return file.id;
}
function toJsonl(items) {
  return items.map((i) => JSON.stringify(i)).join("\n");
}
async function cancelBatch(batch) {
  updateBatch(batch.id, {
    status: "cancelled",
    cancelledAt: Math.floor(Date.now() / 1e3)
  });
  log.info("BATCH", `[BATCH] Cancelled batch ${batch.id}`);
}
function failBatch(batchId, reason) {
  updateBatch(batchId, {
    status: "failed",
    failedAt: Math.floor(Date.now() / 1e3),
    errors: [{ message: reason }]
  });
  activeBatches.delete(batchId);
}
async function waitForAllBatches() {
  await Promise.all(Array.from(activeProcesses));
}
function getCachedHeaders() {
  return { headers: prevHeaders, timestamp: prevHeadersTimestamp };
}
function resetCachedHeaders() {
  prevHeaders = null;
  prevHeadersTimestamp = 0;
}
function resetBatchProcessorState() {
  activeBatches.clear();
  activeProcesses.clear();
  isProcessing = false;
  prevHeaders = null;
  prevHeadersTimestamp = 0;
}
export {
  BATCH_ITEM_DISPATCH_TIMEOUT_MS,
  buildRequestBody,
  getCachedHeaders,
  initBatchProcessor,
  maybeThrottle,
  parseBatchItems,
  processPendingBatches,
  resetBatchProcessorState,
  resetCachedHeaders,
  stopBatchProcessor,
  waitForAllBatches,
  withItemDispatchTimeout
};
