import { createHash } from "crypto";
import {
  acquireBrowserContext,
  openPage
} from "../../services/browserPool.js";
const CLAUDE_WEB_TEMPLATE_TTL_MS = 30 * 60 * 1e3;
const CLAUDE_WEB_TEMPLATE_MAX = 5e3;
const MAX_CLAUDE_WEB_BROWSER_RESPONSE_BYTES = 16 * 1024 * 1024;
const CLAUDE_WEB_INPUT_SELECTOR = "div[contenteditable='true']";
const browserTemplateCache = /* @__PURE__ */ new Map();
let testNow = null;
const defaultDeps = {
  acquireContext: acquireBrowserContext,
  openPage,
  fetchResponse: fetchClaudeWebPageResponse
};
function now() {
  return testNow ?? Date.now();
}
function cloneValue(value) {
  return structuredClone(value);
}
function expectedRequestUrl(request) {
  return `https://claude.ai/api/organizations/${encodeURIComponent(request.organizationId)}/chat_conversations/${encodeURIComponent(request.conversationId)}/${request.endpointSuffix}`;
}
function verifyRequestUrl(request) {
  if (request.url !== expectedRequestUrl(request)) {
    throw new Error("Claude Web browser request endpoint does not match prepared state");
  }
}
function extractBrowserTemplate(uiPayload) {
  return {
    tools: Array.isArray(uiPayload.tools) ? cloneValue(uiPayload.tools) : [],
    ...Array.isArray(uiPayload.tool_states) ? { toolStates: cloneValue(uiPayload.tool_states) } : {},
    personalizedStyles: Array.isArray(uiPayload.personalized_styles) ? cloneValue(uiPayload.personalized_styles) : []
  };
}
function pruneExpiredTemplates() {
  const currentTime = now();
  for (const [key, entry] of browserTemplateCache) {
    if (currentTime >= entry.expiresAt) browserTemplateCache.delete(key);
  }
}
function rememberBrowserTemplate(poolKey, template, context) {
  pruneExpiredTemplates();
  if (browserTemplateCache.has(poolKey)) browserTemplateCache.delete(poolKey);
  while (browserTemplateCache.size >= CLAUDE_WEB_TEMPLATE_MAX) {
    const oldestKey = browserTemplateCache.keys().next().value;
    if (typeof oldestKey !== "string") break;
    browserTemplateCache.delete(oldestKey);
  }
  browserTemplateCache.set(poolKey, {
    template: cloneValue(template),
    context,
    expiresAt: now() + CLAUDE_WEB_TEMPLATE_TTL_MS
  });
}
function lookupBrowserTemplate(poolKey) {
  const entry = browserTemplateCache.get(poolKey);
  if (!entry) return null;
  if (now() >= entry.expiresAt) {
    browserTemplateCache.delete(poolKey);
    return null;
  }
  return {
    template: cloneValue(entry.template),
    context: entry.context,
    expiresAt: entry.expiresAt
  };
}
function buildClaudeWebBrowserPoolKey(input) {
  const digest = createHash("sha256").update(
    [input.scopeKey, input.organizationId, input.cookieString, input.locale, input.timezone].join(
      String.fromCharCode(31)
    )
  ).digest("hex");
  return `claude-web:${digest}`;
}
function mergeClaudeWebBrowserPayload(uiPayload, preparedPayload) {
  const template = extractBrowserTemplate(uiPayload);
  const merged = {
    ...uiPayload,
    ...preparedPayload,
    tools: template.tools,
    personalized_styles: template.personalizedStyles,
    ...template.toolStates ? { tool_states: template.toolStates } : {}
  };
  if (!("parent_message_uuid" in preparedPayload)) {
    delete merged.parent_message_uuid;
  }
  if (!("create_conversation_params" in preparedPayload)) {
    delete merged.create_conversation_params;
  }
  if (!template.toolStates && !("tool_states" in preparedPayload)) {
    delete merged.tool_states;
  }
  return merged;
}
function mergeTemplateIntoPrepared(template, preparedPayload) {
  return {
    ...preparedPayload,
    tools: cloneValue(template.tools),
    personalized_styles: cloneValue(template.personalizedStyles),
    ...!("tool_states" in preparedPayload) && template.toolStates ? { tool_states: cloneValue(template.toolStates) } : {}
  };
}
function applyClaudeWebBrowserTemplate(request) {
  if (request.payload.tools.length > 0) return request;
  const cached = lookupBrowserTemplate(buildClaudeWebBrowserPoolKey(request));
  if (!cached) return request;
  return {
    ...request,
    payload: mergeTemplateIntoPrepared(cached.template, request.payload)
  };
}
function browserFetchHeaders(headers) {
  const forbidden = /* @__PURE__ */ new Set([
    "accept-encoding",
    "connection",
    "content-length",
    "cookie",
    "host",
    "origin",
    "referer",
    "user-agent"
  ]);
  const filtered = {};
  for (const [name, value] of Object.entries(headers)) {
    const normalized = name.toLowerCase();
    if (forbidden.has(normalized) || normalized.startsWith("sec-")) continue;
    filtered[name] = value;
  }
  return filtered;
}
function makeBrowserFetchInput(request, payload, capturedHeaders = {}) {
  return {
    url: request.url,
    headers: browserFetchHeaders({ ...capturedHeaders, ...request.headers }),
    body: JSON.stringify(payload),
    maxBytes: MAX_CLAUDE_WEB_BROWSER_RESPONSE_BYTES
  };
}
async function fetchClaudeWebPageResponse(page, input) {
  const captured = await page.evaluate(async ({ url, headers, body, maxBytes }) => {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body,
      credentials: "include"
    });
    const responseHeaders = Object.fromEntries(response.headers.entries());
    const declaredLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
      await response.body?.cancel().catch(() => {
      });
      throw new Error("Claude Web browser response exceeded the size limit");
    }
    const reader = response.body?.getReader();
    const bodyChunks = [];
    let totalBytes = 0;
    const encodeBase64 = (bytes) => {
      let binary = "";
      const sliceSize = 32 * 1024;
      for (let offset = 0; offset < bytes.byteLength; offset += sliceSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + sliceSize));
      }
      return btoa(binary);
    };
    try {
      while (reader) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel().catch(() => {
          });
          throw new Error("Claude Web browser response exceeded the size limit");
        }
        bodyChunks.push(encodeBase64(value));
      }
    } finally {
      try {
        reader?.releaseLock();
      } catch {
      }
    }
    return {
      status: response.status,
      headers: responseHeaders,
      bodyChunks
    };
  }, input);
  const chunks = captured.bodyChunks.map((chunk) => Buffer.from(chunk, "base64"));
  return {
    status: captured.status,
    headers: captured.headers,
    body: Buffer.concat(chunks)
  };
}
function throwIfAborted(signal) {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}
async function withAbort(promise, signal) {
  if (!signal) return promise;
  throwIfAborted(signal);
  let abortListener;
  const aborted = new Promise((_, reject) => {
    abortListener = () => reject(new DOMException("Aborted", "AbortError"));
    signal.addEventListener("abort", abortListener, { once: true });
  });
  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (abortListener) signal.removeEventListener("abort", abortListener);
  }
}
async function captureCompletion(page, request, poolKey, context) {
  let resolveInterception;
  let rejectInterception;
  const intercepted = new Promise((resolve, reject) => {
    resolveInterception = resolve;
    rejectInterception = reject;
  });
  const matchesPreparedRoute = (url) => {
    if (!("create_conversation_params" in request.payload)) {
      return url.toString() === request.url;
    }
    if (url.origin !== "https://claude.ai" || url.search || url.hash) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length !== 6 || segments[0] !== "api" || segments[1] !== "organizations" || segments[3] !== "chat_conversations" || !segments[4] || segments[5] !== "completion") {
      return false;
    }
    try {
      return decodeURIComponent(segments[2]) === request.organizationId;
    } catch {
      return false;
    }
  };
  await page.route(matchesPreparedRoute, async (route) => {
    try {
      const outgoing = route.request();
      if (outgoing.method() !== "POST" || !matchesPreparedRoute(new URL(outgoing.url()))) {
        throw new Error("Claude Web browser interception target changed");
      }
      const rawPayload = outgoing.postData();
      if (!rawPayload) throw new Error("Claude Web browser request body is missing");
      const uiPayload = JSON.parse(rawPayload);
      if (!uiPayload || typeof uiPayload !== "object" || Array.isArray(uiPayload)) {
        throw new Error("Claude Web browser request body is invalid");
      }
      const capturedHeaders = await outgoing.allHeaders();
      const template = extractBrowserTemplate(uiPayload);
      const merged = mergeClaudeWebBrowserPayload(
        uiPayload,
        request.payload
      );
      await route.abort();
      rememberBrowserTemplate(poolKey, template, context);
      resolveInterception?.(makeBrowserFetchInput(request, merged, capturedHeaders));
    } catch {
      await route.abort().catch(() => {
      });
      rejectInterception?.(new Error("Claude Web browser request interception failed"));
    }
  });
  const guardedInterception = withAbort(intercepted, request.signal);
  void guardedInterception.catch(() => {
  });
  const input = page.locator(CLAUDE_WEB_INPUT_SELECTOR).first();
  try {
    await withAbort(input.waitFor({ state: "visible", timeout: 1e4 }), request.signal);
    await withAbort(input.fill(request.payload.prompt), request.signal);
    await withAbort(page.keyboard.press("Enter"), request.signal);
    return await guardedInterception;
  } catch (error) {
    rejectInterception?.(new Error("Claude Web browser request capture failed"));
    await guardedInterception.catch(() => {
    });
    throw error;
  } finally {
    await page.unroute(matchesPreparedRoute).catch(() => {
    });
  }
}
function captureRetry(request, template) {
  const payload = mergeTemplateIntoPrepared(template, request.payload);
  return makeBrowserFetchInput(request, payload);
}
function toTransportResult(captured) {
  const bytes = new Uint8Array(captured.body);
  return {
    status: captured.status,
    headers: new Headers(captured.headers),
    body: new Response(bytes).body
  };
}
async function sendClaudeWebBrowser(request, deps = defaultDeps) {
  verifyRequestUrl(request);
  throwIfAborted(request.signal);
  const poolKey = buildClaudeWebBrowserPoolKey(request);
  const retryEntry = request.endpointSuffix === "retry_completion" ? lookupBrowserTemplate(poolKey) : null;
  if (request.endpointSuffix === "retry_completion" && !retryEntry) {
    throw new Error("Claude Web browser retry requires a scoped UI template");
  }
  const pooled = await deps.acquireContext(poolKey, {
    cookieDomain: ".claude.ai",
    cookieString: request.cookieString,
    warmupUrl: request.pageUrl,
    locale: request.locale,
    timezone: request.timezone,
    proxyProviderKey: "claude-web"
  });
  const page = await deps.openPage(pooled);
  try {
    if (retryEntry && retryEntry.context !== pooled.context) {
      throw new Error("Claude Web browser context no longer matches scoped UI template");
    }
    await page.goto(request.pageUrl, {
      waitUntil: "domcontentloaded",
      timeout: 6e4
    });
    throwIfAborted(request.signal);
    const fetchInput = retryEntry ? captureRetry(request, retryEntry.template) : await captureCompletion(page, request, poolKey, pooled.context);
    const captured = await withAbort(deps.fetchResponse(page, fetchInput), request.signal);
    if (captured.body.byteLength > MAX_CLAUDE_WEB_BROWSER_RESPONSE_BYTES) {
      throw new Error("Claude Web browser response exceeded the size limit");
    }
    return toTransportResult(captured);
  } finally {
    await page.close().catch(() => {
    });
  }
}
function __resetClaudeWebBrowserTemplatesForTesting() {
  browserTemplateCache.clear();
}
function __setClaudeWebBrowserNowForTesting(value) {
  testNow = value;
}
export {
  __resetClaudeWebBrowserTemplatesForTesting,
  __setClaudeWebBrowserNowForTesting,
  applyClaudeWebBrowserTemplate,
  buildClaudeWebBrowserPoolKey,
  fetchClaudeWebPageResponse,
  mergeClaudeWebBrowserPayload,
  sendClaudeWebBrowser
};
