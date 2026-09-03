import { normalizeSessionCookieHeader } from "../utils/webCookieAuth.js";
import { CLAUDE_WEB_FINGERPRINT } from "../config/claudeWebFingerprint.js";
import { FETCH_TIMEOUT_MS } from "./executorConstants.js";
import { tlsFetchClaude } from "../services/claudeTlsClient.js";
import { buildErrorBody, sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { mergeAbortSignals, mergeUpstreamExtraHeaders } from "./executorUtils.js";
import { BaseExecutor } from "./base.js";
import {
  applyClaudeWebBrowserTemplate,
  sendClaudeWebBrowser
} from "./claude-web/browserTransport.js";
import {
  commitClaudeWebTurn,
  invalidateClaudeWebTurn,
  prepareClaudeWebTurn
} from "./claude-web/session.js";
import { createClaudeWebResponse } from "./claude-web/stream.js";
import { isClaudeWebChallenge, sendClaudeWebDirect } from "./claude-web/transport.js";
const CLAUDE_WEB_API_BASE = "https://claude.ai/api";
const CLAUDE_WEB_ORGS_URL = `${CLAUDE_WEB_API_BASE}/organizations`;
const CLAUDE_SESSION_COOKIE_NAME = "sessionKey";
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const CLAUDE_USER_AGENT = CLAUDE_WEB_FINGERPRINT.userAgent;
function readCredentialString(credentials, key) {
  if (!credentials || typeof credentials !== "object") return void 0;
  const record = credentials;
  const direct = record[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  const providerData = record.providerSpecificData;
  if (providerData && typeof providerData === "object" && !Array.isArray(providerData)) {
    const nested = providerData[key];
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  return void 0;
}
function readClaudeWebCookie(credentials) {
  const direct = readCredentialString(credentials, "cookie");
  if (direct) return direct;
  return readCredentialString(credentials, "apiKey") ?? "";
}
function readClaudeWebDeviceId(credentials) {
  return readCredentialString(credentials, "deviceId");
}
function readClaudeWebOrganizationId(credentials) {
  return readCredentialString(credentials, "orgId");
}
function normalizeClaudeSessionCookie(rawValue) {
  return normalizeSessionCookieHeader(rawValue, CLAUDE_SESSION_COOKIE_NAME);
}
function getBrowserHeaders(deviceId, referer = "https://claude.ai/new", locale = "en-US") {
  const headers = {
    Accept: "text/event-stream",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    "Accept-Language": `${locale},en;q=0.9`,
    "Cache-Control": "no-cache",
    "Content-Type": "application/json",
    Origin: "https://claude.ai",
    Pragma: "no-cache",
    Priority: "u=1, i",
    Referer: referer,
    "Sec-Ch-Ua": CLAUDE_WEB_FINGERPRINT.secChUa,
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": CLAUDE_WEB_FINGERPRINT.secChUaPlatform,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": CLAUDE_USER_AGENT,
    "anthropic-client-platform": "web_claude_ai"
  };
  if (deviceId) headers["anthropic-device-id"] = deviceId;
  return headers;
}
function combineWithTimeout(signal) {
  const timeoutSignal = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  return signal ? mergeAbortSignals(signal, timeoutSignal) : timeoutSignal;
}
async function verifyCookieValidity(cookieHeader, deviceId, signal) {
  try {
    const response = await tlsFetchClaude(CLAUDE_WEB_ORGS_URL, {
      method: "GET",
      headers: { ...getBrowserHeaders(deviceId), Cookie: cookieHeader },
      timeoutMs: FETCH_TIMEOUT_MS,
      signal: combineWithTimeout(signal)
    });
    return response.status === 200;
  } catch {
    return false;
  }
}
async function getOrganizationId(cookieHeader, deviceId, signal) {
  try {
    const response = await tlsFetchClaude(CLAUDE_WEB_ORGS_URL, {
      method: "GET",
      headers: { ...getBrowserHeaders(deviceId), Cookie: cookieHeader },
      timeoutMs: FETCH_TIMEOUT_MS,
      signal: combineWithTimeout(signal)
    });
    if (response.status === 401) {
      return { organizationId: null, failure: "authentication" };
    }
    if (response.status === 403) {
      const bodyText = response.text ?? "";
      if (isClaudeWebChallenge({
        status: response.status,
        headers: response.headers,
        body: null,
        bodyText
      })) {
        return { organizationId: null, failure: "challenge" };
      }
      return { organizationId: null, failure: "authentication" };
    }
    if (response.status !== 200) {
      return { organizationId: null, failure: "unavailable" };
    }
    const parsed = JSON.parse(response.text ?? "[]");
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { organizationId: null, failure: "unavailable" };
    }
    const organization = parsed[0];
    if (!organization || typeof organization !== "object" || Array.isArray(organization)) {
      return { organizationId: null, failure: "unavailable" };
    }
    const record = organization;
    const identifier = record.uuid ?? record.id;
    return typeof identifier === "string" && identifier.trim() ? { organizationId: identifier.trim(), failure: null } : { organizationId: null, failure: "unavailable" };
  } catch {
    return { organizationId: null, failure: "unavailable" };
  }
}
function isEnabledFlag(value) {
  return value === "1" || value === "true" || value === "on";
}
function forceBrowserTransport() {
  return isEnabledFlag(process.env.WEB_COOKIE_USE_BROWSER);
}
function browserFallbackEnabled() {
  return forceBrowserTransport() || isEnabledFlag(process.env.OMNIROUTE_BROWSER_POOL);
}
function makeCompletionUrl(turn, organizationId) {
  return `${CLAUDE_WEB_API_BASE}/organizations/${encodeURIComponent(organizationId)}/chat_conversations/${encodeURIComponent(turn.conversationId)}/${turn.endpointSuffix}`;
}
function makeErrorResponse(status, message, options) {
  const body = buildErrorBody(status, message, options?.details);
  if (options?.type) body.error.type = options.type;
  if (options?.code) body.error.code = options.code;
  const headers = { "Content-Type": "application/json" };
  if (options?.extraHeaders) {
    for (const [key, value] of Object.entries(options.extraHeaders)) {
      headers[key] = value;
    }
  }
  return new Response(JSON.stringify(body), {
    status,
    headers
  });
}
function makeExecutionResult(response, transformedBody, url = "", headers = {}) {
  return { response, url, headers, transformedBody };
}
function makeAuditUrl(turn) {
  return `${CLAUDE_WEB_API_BASE}/organizations/<organization>/chat_conversations/<conversation>/${turn.endpointSuffix}`;
}
function makeAuditHeaders() {
  return {
    Accept: "text/event-stream",
    "Content-Type": "application/json",
    "anthropic-client-platform": "web_claude_ai"
  };
}
function makeAuditBody(model, stream, operation) {
  return {
    model,
    stream,
    claude_web: {
      provider: "claude-web",
      ...operation ? { operation } : {}
    }
  };
}
async function readTransportErrorText(result) {
  if (result.bodyText !== void 0) return result.bodyText;
  if (!result.body) return "";
  const reader = result.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  try {
    while (total < MAX_ERROR_BODY_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = MAX_ERROR_BODY_BYTES - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      total += chunk.byteLength;
      output += decoder.decode(chunk, { stream: total < MAX_ERROR_BODY_BYTES });
      if (chunk.byteLength < value.byteLength) break;
    }
    output += decoder.decode();
    return output;
  } finally {
    await reader.cancel().catch(() => {
    });
    try {
      reader.releaseLock();
    } catch {
    }
  }
}
async function errorResponseForTransport(result, turn) {
  const bodyText = await readTransportErrorText(result);
  if (result.status === 401) {
    invalidateClaudeWebTurn(turn, "conversation");
    return makeErrorResponse(401, "Session expired or invalid");
  }
  if (result.status === 429) {
    const extraHeaders = {};
    const upstreamRetryAfter = result.headers.get("retry-after");
    if (upstreamRetryAfter) {
      extraHeaders["Retry-After"] = upstreamRetryAfter;
    }
    return makeErrorResponse(429, "Rate limited by Claude Web API", { extraHeaders });
  }
  if (isClaudeWebChallenge({ ...result, bodyText })) {
    return makeErrorResponse(403, "Claude Web returned a Cloudflare browser challenge", {
      type: "cloudflare_challenge",
      code: "cf_mitigated_challenge"
    });
  }
  return makeErrorResponse(
    result.status >= 400 && result.status <= 599 ? result.status : 502,
    `Claude Web API error (${result.status || 502})`
  );
}
class ClaudeWebExecutor extends BaseExecutor {
  sendDirect;
  sendBrowser;
  constructor(deps = {}) {
    super("claude-web", { baseUrl: CLAUDE_WEB_API_BASE });
    this.sendDirect = deps.sendDirect ?? sendClaudeWebDirect;
    this.sendBrowser = deps.sendBrowser ?? sendClaudeWebBrowser;
  }
  async testConnection(credentials, signal) {
    try {
      const rawCookie = readClaudeWebCookie(credentials);
      if (!rawCookie.trim()) return false;
      const cookieHeader = normalizeClaudeSessionCookie(rawCookie);
      return verifyCookieValidity(cookieHeader, readClaudeWebDeviceId(credentials), signal);
    } catch {
      return false;
    }
  }
  async execute({ model, body, stream, credentials, signal, log }) {
    const initialAuditBody = makeAuditBody(model, stream);
    const bodyObj = body && typeof body === "object" && !Array.isArray(body) ? body : null;
    if (!bodyObj) {
      return makeExecutionResult(makeErrorResponse(400, "Invalid request body"), {});
    }
    if (!credentials || typeof credentials !== "object") {
      return makeExecutionResult(makeErrorResponse(400, "Invalid credentials"), initialAuditBody);
    }
    const rawCookie = readClaudeWebCookie(credentials);
    if (!rawCookie.trim()) {
      return makeExecutionResult(
        makeErrorResponse(401, "Missing session cookie"),
        initialAuditBody
      );
    }
    let cookieHeader;
    try {
      cookieHeader = normalizeClaudeSessionCookie(rawCookie);
    } catch (error) {
      return makeExecutionResult(
        makeErrorResponse(401, sanitizeErrorMessage(error)),
        initialAuditBody
      );
    }
    const deviceId = readClaudeWebDeviceId(credentials);
    let organizationId = readClaudeWebOrganizationId(credentials);
    if (!organizationId) {
      const resolution = await getOrganizationId(cookieHeader, deviceId, signal);
      organizationId = resolution.organizationId ?? void 0;
      if (resolution.failure === "authentication") {
        log?.warn?.("CLAUDE-WEB", "Organization discovery rejected the authenticated session");
        return makeExecutionResult(
          makeErrorResponse(401, "Session expired or invalid"),
          initialAuditBody,
          CLAUDE_WEB_ORGS_URL,
          makeAuditHeaders()
        );
      }
      if (resolution.failure === "challenge") {
        log?.warn?.("CLAUDE-WEB", "Organization discovery encountered a browser challenge");
        return makeExecutionResult(
          makeErrorResponse(403, "Claude Web returned a Cloudflare browser challenge", {
            type: "cloudflare_challenge",
            code: "cf_mitigated_challenge"
          }),
          initialAuditBody,
          CLAUDE_WEB_ORGS_URL,
          makeAuditHeaders()
        );
      }
    }
    if (!organizationId) {
      log?.warn?.("CLAUDE-WEB", "Authenticated organization could not be resolved");
      return makeExecutionResult(
        makeErrorResponse(502, "Unable to determine the authenticated Claude Web organization"),
        initialAuditBody,
        CLAUDE_WEB_ORGS_URL,
        makeAuditHeaders()
      );
    }
    let turn;
    try {
      turn = prepareClaudeWebTurn({
        body: bodyObj,
        model,
        credentials,
        organizationId,
        normalizedCookie: cookieHeader
      });
    } catch (error) {
      return makeExecutionResult(
        makeErrorResponse(400, sanitizeErrorMessage(error)),
        initialAuditBody
      );
    }
    const url = makeCompletionUrl(turn, organizationId);
    const headers = getBrowserHeaders(deviceId, turn.pageUrl, turn.payload.locale);
    const transportRequest = {
      scopeKey: turn.accountScope,
      organizationId,
      conversationId: turn.conversationId,
      endpointSuffix: turn.endpointSuffix,
      pageUrl: turn.pageUrl,
      url,
      cookieString: cookieHeader,
      headers,
      payload: turn.payload,
      locale: turn.payload.locale,
      timezone: turn.payload.timezone,
      signal
    };
    const auditBody = makeAuditBody(model, stream, turn.operation);
    const auditUrl = makeAuditUrl(turn);
    const auditHeaders = makeAuditHeaders();
    try {
      let transportResult;
      if (forceBrowserTransport()) {
        transportResult = await this.sendBrowser(transportRequest);
      } else {
        const directRequest = applyClaudeWebBrowserTemplate(transportRequest);
        transportResult = await this.sendDirect(directRequest);
        if (isClaudeWebChallenge(transportResult) && browserFallbackEnabled()) {
          transportResult = await this.sendBrowser(directRequest);
        }
      }
      if (transportResult.status < 200 || transportResult.status >= 300) {
        return makeExecutionResult(
          await errorResponseForTransport(transportResult, turn),
          auditBody,
          auditUrl,
          auditHeaders
        );
      }
      if (!transportResult.body) {
        invalidateClaudeWebTurn(turn);
        return makeExecutionResult(
          makeErrorResponse(502, "Claude Web returned no response body"),
          auditBody,
          auditUrl,
          auditHeaders
        );
      }
      const response = await createClaudeWebResponse(transportResult.body, {
        model,
        stream,
        responseMetadata: turn.responseMetadata,
        onComplete: ({ assistantText }) => commitClaudeWebTurn(turn, assistantText),
        onFailure: () => invalidateClaudeWebTurn(turn),
        log
      });
      return makeExecutionResult(response, auditBody, auditUrl, auditHeaders);
    } catch {
      invalidateClaudeWebTurn(turn);
      log?.error?.("CLAUDE-WEB", "Transport failed");
      return makeExecutionResult(
        makeErrorResponse(502, "Claude Web connection failed"),
        auditBody,
        auditUrl,
        auditHeaders
      );
    }
  }
}
export {
  ClaudeWebExecutor
};
