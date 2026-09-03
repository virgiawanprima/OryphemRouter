import { extractProviderWarnings } from "../../utils/omni/lib-compliance.js";
import { logAuditEvent } from "../../utils/omni/lib-compliance.js";
import { emit } from "../../utils/omni/lib-eventBus.js";
import { saveCallLog } from "../../utils/omni/lib-usageDb.js";
import { FORMATS } from "../../translator/formats.js";
import { takeEarlyKeepaliveBytes } from "../../utils/omni/earlyKeepaliveByteBuffer.js";
import { cloneBoundedChatLogPayload, truncateForLog } from "./logTruncation.js";
import { attachLogMeta } from "./cacheUsageMeta.js";
function extractResponsesId(sourceFormat, clientResponse) {
  if (sourceFormat !== FORMATS.OPENAI_RESPONSES) return null;
  if (!clientResponse || typeof clientResponse !== "object") return null;
  const id = clientResponse.id;
  return typeof id === "string" && id.length > 0 ? id : null;
}
function toConnectionId(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function buildAccountRotationMeta(provider, initialConnectionId, finalConnectionId) {
  if (provider !== "codex" || !initialConnectionId || !finalConnectionId) return null;
  if (initialConnectionId === finalConnectionId) return null;
  return {
    codexAccountRotation: {
      initialConnectionId,
      finalConnectionId
    }
  };
}
function resolveRequestLifecycleEvent(input) {
  const { traceId, status, error, model, provider, comboName, tokens, latencyMs } = input;
  const succeeded = typeof status === "number" && status >= 200 && status < 400 && !error;
  const resolvedComboName = typeof comboName === "string" && comboName ? comboName : void 0;
  if (succeeded) {
    const tokenBag = tokens && typeof tokens === "object" ? tokens : {};
    const num = (v) => typeof v === "number" && Number.isFinite(v) ? v : 0;
    return {
      name: "request.completed",
      payload: {
        id: traceId,
        status: "success",
        model: model || "unknown",
        provider: provider || "unknown",
        tokensInput: num(tokenBag.input ?? tokenBag.prompt_tokens ?? tokenBag.inputTokens),
        tokensOutput: num(tokenBag.output ?? tokenBag.completion_tokens ?? tokenBag.outputTokens),
        latencyMs,
        comboName: resolvedComboName
      }
    };
  }
  return {
    name: "request.failed",
    payload: {
      id: traceId,
      error: error || `HTTP ${status}`,
      statusCode: typeof status === "number" ? status : void 0,
      latencyMs,
      model: model || void 0,
      provider: provider || void 0
    }
  };
}
function persistAttemptLogs(args, ctx) {
  const {
    status,
    tokens,
    responseBody,
    error,
    providerRequest,
    providerResponse,
    clientResponse,
    claudeCacheMeta,
    claudeCacheUsageMeta,
    cacheSource
  } = args;
  const {
    traceId,
    provider,
    connectionId,
    model,
    skillRequestId,
    detailedLoggingEnabled,
    reqLogger,
    pendingRequestId,
    clientRawRequest,
    requestedModel,
    credentials,
    startTime,
    body,
    sourceFormat,
    targetFormat,
    comboName,
    comboStepId,
    comboExecutionKey,
    tokensCompressed,
    apiKeyInfo,
    noLogEnabled,
    correlationId,
    modelPinned,
    sessionTag
  } = ctx;
  const initialConnectionId = toConnectionId(connectionId);
  const finalConnectionId = toConnectionId(credentials?.connectionId) || initialConnectionId;
  const accountRotationMeta = buildAccountRotationMeta(
    provider,
    initialConnectionId,
    finalConnectionId
  );
  const providerWarnings = extractProviderWarnings(providerResponse, clientResponse, responseBody);
  if (providerWarnings.length > 0) {
    logAuditEvent({
      action: "provider.warning",
      actor: "system",
      target: [provider, finalConnectionId].filter(Boolean).join(":") || provider || model,
      resourceType: "provider_warning",
      status: "warning",
      requestId: skillRequestId,
      details: {
        provider,
        model,
        connectionId: finalConnectionId,
        httpStatus: status,
        warnings: providerWarnings
      }
    });
  }
  const capturedPipeline = reqLogger?.getPipelinePayloads?.() ?? null;
  const pipelinePayloads = detailedLoggingEnabled ? capturedPipeline ?? {} : capturedPipeline?.routeDecision ? { routeDecision: capturedPipeline.routeDecision } : null;
  if (pipelinePayloads) {
    if (providerRequest !== void 0 && !pipelinePayloads.providerRequest) {
      pipelinePayloads.providerRequest = providerRequest;
    }
    if (providerResponse !== void 0 && !pipelinePayloads.providerResponse) {
      pipelinePayloads.providerResponse = providerResponse;
    }
    if (clientResponse !== void 0) {
      pipelinePayloads.clientResponse = clientResponse;
    }
    if (error) {
      pipelinePayloads.error = {
        ...typeof pipelinePayloads.error === "object" && pipelinePayloads.error ? pipelinePayloads.error : {},
        message: error
      };
    }
    if (detailedLoggingEnabled && correlationId) {
      const earlyClientBytes = takeEarlyKeepaliveBytes(correlationId);
      if (earlyClientBytes.length > 0) {
        const existingStreamChunks = pipelinePayloads.streamChunks ?? {};
        pipelinePayloads.streamChunks = {
          ...existingStreamChunks,
          client: [...earlyClientBytes, ...existingStreamChunks.client ?? []]
        };
      }
    }
  }
  saveCallLog({
    id: pendingRequestId,
    method: "POST",
    path: clientRawRequest?.endpoint || "/v1/chat/completions",
    status,
    model,
    requestedModel,
    provider,
    connectionId: finalConnectionId || void 0,
    duration: Date.now() - startTime,
    tokens: tokens || {},
    requestBody: cloneBoundedChatLogPayload(
      attachLogMeta(truncateForLog(body), {
        ...accountRotationMeta,
        claudePromptCache: claudeCacheMeta
      })
    ),
    responseBody: cloneBoundedChatLogPayload(
      attachLogMeta(truncateForLog(responseBody), {
        ...accountRotationMeta,
        claudePromptCache: claudeCacheMeta ? {
          applied: claudeCacheMeta.applied,
          totalBreakpoints: claudeCacheMeta.totalBreakpoints,
          anthropicBeta: claudeCacheMeta.anthropicBeta
        } : null,
        claudePromptCacheUsage: claudeCacheUsageMeta
      })
    ),
    error: error || null,
    sourceFormat,
    targetFormat,
    comboName,
    comboStepId,
    comboExecutionKey,
    tokensCompressed,
    cacheSource: cacheSource === "semantic" ? "semantic" : "upstream",
    apiKeyId: apiKeyInfo?.id || null,
    apiKeyName: apiKeyInfo?.name || null,
    noLog: noLogEnabled,
    pipelinePayloads,
    correlationId,
    modelPinned: modelPinned || false,
    sessionTag: sessionTag || null,
    responseId: extractResponsesId(sourceFormat, clientResponse)
  }).catch(() => {
  });
  setImmediate(() => {
    const lifecycle = resolveRequestLifecycleEvent({
      traceId,
      status,
      error,
      model,
      provider,
      comboName,
      tokens,
      latencyMs: Date.now() - startTime
    });
    if (lifecycle.name === "request.completed") {
      emit("request.completed", lifecycle.payload);
    } else {
      emit("request.failed", lifecycle.payload);
    }
  });
}
export {
  persistAttemptLogs,
  resolveRequestLifecycleEvent
};
