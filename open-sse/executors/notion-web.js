import { randomUUID } from "node:crypto";
import { BaseExecutor } from "./base.js";
import { makeExecutorErrorResult as makeErrorResult } from "../utils/errorSanitize.js";
import {
  BROWSER_HEADERS,
  extractNotionUserIdFromCookie,
  resolveNotionCodename,
  resolveNotionRuntimeWorkspace
} from "../services/notionWebModels.js";
import {
  __resetNotionThreadSessionsForTests,
  conversationPrefixBeforeLastUser,
  extractNotionMessageText,
  hashNotionConversation,
  notionThreadMarkConfirmed,
  notionThreadMarkCreateAttempted,
  notionThreadSessionLookup,
  notionThreadSessionStore,
  readClientThreadId,
  hashNotionCallerCookie,
  resolveNotionThreadBinding
} from "../services/notionThreadSessions.js";
import {
  extractNotionUpstreamError,
  parseNotionInferenceStream,
  sanitizeNotionAssistantText
} from "../services/notionStreamParser.js";
import {
  buildNotionTranscript
} from "../services/notionTranscriptBuilder.js";
import {
  tlsFetchNotion,
  TlsClientUnavailableError
} from "../services/notionTlsClient.js";
const BASE_URL = "https://app.notion.com";
const NOTION_URL = `${BASE_URL}/api/v3/runInferenceTranscript`;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36";
const NOTION_CLIENT_VERSION = "23.13.20260720.1949";
function readCredentialString(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}
function readProviderSpecificString(providerSpecificData, keys) {
  if (!providerSpecificData || typeof providerSpecificData !== "object" || Array.isArray(providerSpecificData)) {
    return "";
  }
  const data = providerSpecificData;
  for (const key of keys) {
    const value = readCredentialString(data[key]);
    if (value) return value;
  }
  return "";
}
function buildStructuredOutputInstruction(responseFormat) {
  if (!responseFormat || typeof responseFormat !== "object" || Array.isArray(responseFormat)) {
    return "";
  }
  const format = responseFormat;
  const type = typeof format.type === "string" ? format.type : "";
  if (type !== "json_object" && type !== "json_schema") return "";
  const lines = [
    "Structured output requirement:",
    "- Return only valid JSON.",
    "- Do not wrap the JSON in markdown fences.",
    "- Do not add prose before or after the JSON."
  ];
  if (type === "json_schema" && format.json_schema && typeof format.json_schema === "object") {
    try {
      lines.push(`- Match this JSON schema: ${JSON.stringify(format.json_schema)}`);
    } catch {
      lines.push("- Match the requested JSON schema.");
    }
  }
  return lines.join("\n");
}
function appendStructuredOutputInstruction(messages, responseFormat) {
  const instruction = buildStructuredOutputInstruction(responseFormat);
  if (!instruction) return messages;
  return [{ role: "system", content: instruction }, ...messages];
}
function normalizeNotionCookieInput(raw, cookieName = "token_v2") {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  return trimmed.includes("=") ? trimmed : `${cookieName}=${trimmed}`;
}
function resolveNotionWebCookie(credentials) {
  const directCookie = readCredentialString(credentials?.apiKey) || readCredentialString(credentials?.cookie);
  if (directCookie) return normalizeNotionCookieInput(directCookie);
  const providerSpecificData = credentials?.providerSpecificData;
  const cookie = readProviderSpecificString(providerSpecificData, ["cookie"]);
  if (cookie) return normalizeNotionCookieInput(cookie);
  const tokenV2 = readProviderSpecificString(providerSpecificData, ["token_v2", "tokenV2"]);
  const spaceId = readProviderSpecificString(providerSpecificData, ["space_id", "spaceId"]);
  const userId = readProviderSpecificString(providerSpecificData, [
    "notion_user_id",
    "notionUserId",
    "user_id",
    "userId"
  ]);
  const browserId = readProviderSpecificString(providerSpecificData, [
    "notion_browser_id",
    "notionBrowserId"
  ]);
  return [
    tokenV2 ? normalizeNotionCookieInput(tokenV2) : "",
    spaceId ? `space_id=${spaceId}` : "",
    userId ? `notion_user_id=${userId}` : "",
    browserId ? `notion_browser_id=${browserId}` : ""
  ].filter(Boolean).join("; ");
}
function extractSpaceIdFromCookie(cookie) {
  const match = cookie.match(/(?:^|;\s*)space_id=([^;]+)/i);
  if (match) return match[1].trim();
  const camel = cookie.match(/(?:^|;\s*)spaceId=([^;]+)/);
  return camel ? camel[1].trim() : "";
}
function extractUserIdFromCookie(cookie) {
  return extractNotionUserIdFromCookie(cookie);
}
function estimateNotionUsage(messages, content) {
  const promptText = (messages || []).map((m) => extractNotionMessageText(m?.content)).join("\n");
  const prompt_tokens = promptText ? Math.max(1, Math.ceil(promptText.length / 4)) : 0;
  const completion_tokens = content ? Math.max(1, Math.ceil(content.length / 4)) : 0;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
    estimated: true
  };
}
function chatCompletionResponse(content, model, messages, threadId) {
  const id = threadId ? `chatcmpl-notion-${threadId}` : `chatcmpl-notion-${Date.now()}`;
  return new Response(
    JSON.stringify({
      id,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model,
      choices: [{ index: 0, message: { role: "assistant", content }, finish_reason: "stop" }],
      usage: estimateNotionUsage(messages, content),
      // Non-standard but useful for clients that want to pin continuity explicitly
      notion_thread_id: threadId || void 0
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...threadId ? { "X-Notion-Thread-Id": threadId } : {}
      }
    }
  );
}
function pseudoStreamResponse(content, model, threadId) {
  const encoder = new TextEncoder();
  const id = threadId ? `chatcmpl-notion-${threadId}` : `chatcmpl-notion-${Date.now()}`;
  const chunk = (delta, finishReason) => ({
    id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [{ index: 0, delta: delta ? { content: delta } : {}, finish_reason: finishReason }]
  });
  const readable = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk(content, null))}

`));
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk("", "stop"))}

`));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
  return new Response(readable, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...threadId ? { "X-Notion-Thread-Id": threadId } : {}
    }
  });
}
function clientFacingModelId(model) {
  let clientFacingModel = typeof model === "string" ? model.trim() : "";
  if (clientFacingModel.startsWith("notion-web/")) {
    clientFacingModel = clientFacingModel.slice("notion-web/".length);
  } else if (clientFacingModel.startsWith("nw/")) {
    clientFacingModel = clientFacingModel.slice(3);
  }
  return clientFacingModel;
}
async function resolveExecuteWorkspace(cookie, signal) {
  let spaceId = extractSpaceIdFromCookie(cookie);
  let userId = extractUserIdFromCookie(cookie);
  try {
    const resolved = await resolveNotionRuntimeWorkspace({ cookie, signal });
    if (!spaceId) spaceId = resolved.spaceId;
    if (!userId) userId = resolved.userId;
  } catch {
  }
  return { spaceId, userId };
}
function buildNotionInferenceRequestBody(opts) {
  const { spaceId, threadId, transcript, createThread, agent } = opts;
  const isCustom = Boolean(agent?.workflowId);
  const workflowId = agent?.workflowId || "";
  const isFollowUp = !createThread;
  return {
    traceId: randomUUID(),
    spaceId,
    threadId,
    createThread,
    // Only generate a title when starting a new Notion AI chat
    generateTitle: createThread,
    asPatchResponse: true,
    patchResponseVersion: 2,
    isPartialTranscript: isFollowUp,
    saveAllThreadOperations: true,
    setUnreadState: createThread,
    createdSource: isCustom ? "custom_agent" : "ai_module",
    threadType: "workflow",
    supportsCustomAgentNudgeTranscriptStep: true,
    isUserInAnySalesAssistedSpace: false,
    isSpaceSalesAssisted: false,
    transcript,
    // Default AI is parented by the workspace; custom agents by the workflow id.
    threadParentPointer: isCustom ? { table: "workflow", id: workflowId, spaceId } : { table: "space", id: spaceId, spaceId },
    debugOverrides: {
      annotationInferences: {},
      cachedInferences: {},
      emitAgentSearchExtractedResults: true,
      emitInferences: false
    }
  };
}
function buildNotionExecuteHeaders(opts) {
  const isCustom = Boolean(opts.agent?.workflowId);
  const agentPathId = (opts.agent?.workflowId || "").replace(/-/g, "");
  const referer = isCustom && agentPathId ? `${BASE_URL}/agent/${agentPathId}?wfv=chat` : `${BASE_URL}/ai`;
  const reqHeaders = {
    "Content-Type": "application/json",
    "User-Agent": USER_AGENT,
    Accept: "application/x-ndjson",
    Cookie: opts.cookie,
    Origin: BASE_URL,
    Referer: referer,
    "notion-client-version": NOTION_CLIENT_VERSION,
    "notion-audit-log-platform": "web",
    "x-notion-space-id": opts.spaceId,
    "Accept-Language": "en-US,en;q=0.9",
    ...BROWSER_HEADERS
  };
  if (opts.userId) reqHeaders["x-notion-active-user-header"] = opts.userId;
  return reqHeaders;
}
function normalizeNotionWorkflowId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const fromUrl = s.match(/\/agent\/([a-f0-9-]{20,})/i);
  let id = fromUrl ? fromUrl[1] : s;
  id = id.replace(/[^a-f0-9-]/gi, "");
  const hex = id.replace(/-/g, "");
  if (/^[a-f0-9]{32}$/i.test(hex)) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
  }
  if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    return id.toLowerCase();
  }
  return id;
}
function resolveNotionAgentOptions(credentials, cookie) {
  const ps = credentials?.providerSpecificData;
  const workflowFromPs = readProviderSpecificString(ps, [
    "workflowId",
    "workflow_id",
    "notionWorkflowId",
    "notion_workflow_id",
    "agentId",
    "agent_id"
  ]) || "";
  const pageFromPs = readProviderSpecificString(ps, [
    "contextPageId",
    "context_page_id",
    "notionContextPageId"
  ]) || "";
  const readCookie = (name) => {
    const m = cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`, "i"));
    if (!m) return "";
    const raw = m[1].trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };
  const workflowId = normalizeNotionWorkflowId(
    workflowFromPs || readCookie("workflow_id") || readCookie("notion_workflow_id") || readCookie("agent_id")
  );
  const contextPageId = pageFromPs || readCookie("context_page_id") || readCookie("notion_context_page_id") || "";
  return {
    workflowId: workflowId || void 0,
    contextPageId: contextPageId ? contextPageId.trim() : void 0
  };
}
async function sendNotionInferenceRequest(opts) {
  const { reqBody, reqHeaders, signal } = opts;
  let status = 0;
  let rawText = "";
  try {
    const tlsRes = await tlsFetchNotion(NOTION_URL, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(reqBody),
      signal: signal ?? void 0,
      // Inference can take a while (tool-autoload + LLM first token).
      timeoutMs: Number.parseInt(process.env.OMNIROUTE_NOTION_TLS_TIMEOUT_MS || "", 10) || 18e4
    });
    status = tlsRes.status;
    rawText = tlsRes.text ?? "";
  } catch (err) {
    if (err instanceof TlsClientUnavailableError) {
      try {
        const upstream = await fetch(NOTION_URL, {
          method: "POST",
          headers: reqHeaders,
          body: JSON.stringify(reqBody),
          signal: signal ?? void 0
        });
        status = upstream.status;
        rawText = await upstream.text().catch(() => "");
      } catch (fallbackErr) {
        return {
          errorResult: makeErrorResult(
            502,
            `Notion fetch failed: ${fallbackErr instanceof Error ? fallbackErr.message : "unknown error"}`,
            reqBody,
            NOTION_URL
          )
        };
      }
    } else {
      return {
        errorResult: makeErrorResult(
          502,
          `Notion fetch failed: ${err instanceof Error ? err.message : "unknown error"}`,
          reqBody,
          NOTION_URL
        )
      };
    }
  }
  if (status === 401 || status === 403) {
    return {
      errorResult: makeErrorResult(
        status,
        "Notion session expired or invalid \u2014 re-paste token_v2 from notion.so",
        reqBody,
        NOTION_URL
      )
    };
  }
  if (status < 200 || status >= 300) {
    return {
      errorResult: makeErrorResult(
        status || 502,
        `Notion error: ${rawText.slice(0, 500)}`,
        reqBody,
        NOTION_URL
      )
    };
  }
  return { rawText };
}
class NotionWebExecutor extends BaseExecutor {
  constructor() {
    super("notion-web", { id: "notion-web", baseUrl: NOTION_URL });
  }
  async execute(input) {
    const { model, body, stream: wantStream, credentials, signal } = input;
    const requestBody = body || {};
    const cookie = resolveNotionWebCookie(credentials);
    if (!cookie) {
      return makeErrorResult(
        401,
        "Missing Notion token_v2 cookie \u2014 paste it from notion.so DevTools \u2192 Application \u2192 Cookies",
        body,
        NOTION_URL
      );
    }
    const agent = resolveNotionAgentOptions(credentials, cookie);
    const messages = appendStructuredOutputInstruction(
      requestBody.messages || [],
      requestBody.response_format
    );
    if (!messages.some((m) => m.role === "user")) {
      return makeErrorResult(400, "No user message found", body, NOTION_URL);
    }
    const { spaceId, userId } = await resolveExecuteWorkspace(cookie, signal);
    if (!spaceId) {
      return makeErrorResult(
        400,
        "Could not resolve Notion spaceId \u2014 paste space_id from cookies or ensure token_v2 can call getSpaces",
        body,
        NOTION_URL
      );
    }
    const notionCodename = resolveNotionCodename(model);
    const clientFacing = clientFacingModelId(model);
    const modelId = clientFacing || notionCodename || "notion-ai";
    const inboundHeaders = input.clientHeaders ?? input.headers;
    const clientThreadId = readClientThreadId(requestBody, inboundHeaders ?? void 0);
    const callerScope = hashNotionCallerCookie(cookie);
    const threadSpaceKey = agent.workflowId ? `caller:${callerScope}|${spaceId}|wf:${agent.workflowId}` : `caller:${callerScope}|${spaceId}`;
    const binding = resolveNotionThreadBinding(threadSpaceKey, messages, clientThreadId);
    let { threadId, createThread, rootKey } = binding;
    const reqHeaders = buildNotionExecuteHeaders({ cookie, spaceId, userId, agent });
    const isFailedAttempt = (attempt2) => !attempt2.ok;
    const runOnce = async (opts) => {
      const transcript = buildNotionTranscript(messages, {
        notionModel: notionCodename || void 0,
        spaceId,
        userId: userId || void 0,
        agent,
        isFollowUp: !opts.createThread
      });
      const reqBody = buildNotionInferenceRequestBody({
        spaceId,
        userId,
        threadId: opts.threadId,
        transcript,
        createThread: opts.createThread,
        agent
      });
      if (opts.createThread) {
        notionThreadMarkCreateAttempted(rootKey, opts.threadId);
      }
      const { rawText, errorResult } = await sendNotionInferenceRequest({
        reqBody,
        reqHeaders,
        signal
      });
      if (errorResult) {
        const status = errorResult.response?.status ?? 502;
        const retryable = status === 429 || status === 503 || status >= 500;
        return { ok: false, errorResult, retryable, reqBody };
      }
      const raw = rawText || "";
      const upstreamErr = extractNotionUpstreamError(raw);
      if (upstreamErr) {
        const status = upstreamErr.isRetryable ? 503 : 502;
        return {
          ok: false,
          retryable: upstreamErr.isRetryable,
          reqBody,
          errorResult: makeErrorResult(
            status,
            `Notion ${upstreamErr.subType || "error"}: ${upstreamErr.message}`,
            reqBody,
            NOTION_URL
          )
        };
      }
      const finalText = parseNotionInferenceStream(raw);
      if (!finalText) {
        return {
          ok: false,
          retryable: true,
          reqBody,
          errorResult: makeErrorResult(502, "No response from Notion AI", reqBody, NOTION_URL)
        };
      }
      return { ok: true, finalText, reqBody };
    };
    let attempt = await runOnce({ createThread, threadId });
    if (isFailedAttempt(attempt) && attempt.retryable) {
      const delayMs = process.env.NODE_ENV === "test" || process.env.VITEST ? 20 : 700 + Math.floor(Math.random() * 400);
      await new Promise((r) => setTimeout(r, delayMs));
      attempt = await runOnce({ createThread: false, threadId });
    }
    if (isFailedAttempt(attempt)) {
      return attempt.errorResult;
    }
    notionThreadMarkConfirmed(rootKey, threadId);
    notionThreadSessionStore(threadSpaceKey, messages, attempt.finalText, threadId);
    const response = wantStream ? pseudoStreamResponse(attempt.finalText, modelId, threadId) : chatCompletionResponse(attempt.finalText, modelId, messages, threadId);
    return {
      response,
      url: NOTION_URL,
      headers: reqHeaders,
      transformedBody: attempt.reqBody
    };
  }
}
export {
  NotionWebExecutor,
  __resetNotionThreadSessionsForTests,
  buildNotionTranscript,
  conversationPrefixBeforeLastUser,
  estimateNotionUsage,
  extractNotionUpstreamError,
  extractSpaceIdFromCookie,
  hashNotionConversation,
  normalizeNotionCookieInput,
  normalizeNotionWorkflowId,
  notionThreadMarkConfirmed,
  notionThreadMarkCreateAttempted,
  notionThreadSessionLookup,
  notionThreadSessionStore,
  parseNotionInferenceStream,
  resolveNotionAgentOptions,
  resolveNotionThreadBinding,
  resolveNotionWebCookie,
  sanitizeNotionAssistantText
};
