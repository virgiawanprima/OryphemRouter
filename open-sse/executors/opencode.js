import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { getModelSupportedFormats } from "../config/providerModels.js";
import { injectReasoningContent } from "../utils/reasoningContentInjector.js";
import { resolveSessionId } from "../utils/sessionManager.js";

const OPENCODE_UA = "opencode";

function generateRequestId() {
  return `msg_${crypto.randomUUID().replace(/-/g, "")}`;
}

function generateSessionId() {
  return `ses_${crypto.randomUUID().replace(/-/g, "")}`;
}

// Normalize any resolved id into opencode's ses_ format (stable per-conversation)
function toOpencodeSession(id) {
  const stripped = String(id || "").replace(/^ses_/, "").replace(/-/g, "");
  return stripped ? `ses_${stripped}` : null;
}

function resolveOpencodeSession(body, credentials) {
  return toOpencodeSession(resolveSessionId({
    headers: credentials?.rawHeaders,
    body,
    connectionId: credentials?.connectionId,
    scope: "opencode",
  }));
}

export class OpenCodeExecutor extends BaseExecutor {
  constructor() {
    super("opencode", PROVIDERS.opencode);
    this._currentSessionId = null;
  }

  transformRequest(model, body, stream, credentials) {
    this._currentSessionId = resolveOpencodeSession(body, credentials);
    return injectReasoningContent({ provider: this.provider, model, body });
  }

  buildUrl(model, _stream, _urlIndex = 0, credentials = null) {
    const base = this.config.baseUrl;
    // Transport is resolved from metadata, never from a hardcoded model list. This executor
    // used to carry `const MESSAGES_MODELS = new Set()` and branch on it: an empty allowlist
    // that silently pinned EVERY model to /chat/completions — the same "hardcode the matcher
    // instead of reading the declaration" mistake that routed opencode-go's /responses-only
    // models to chat in 9Router.
    //
    // chatCore resolves the per-model format and hands the chosen transport down on
    // `credentials.runtimeTransport`; that value already accounts for the client's
    // sourceFormat, so it wins. The declared-format lookup below covers direct executor use
    // (and any path that does not go through chatCore).
    if (credentials?.runtimeTransport?.baseUrl) return credentials.runtimeTransport.baseUrl;

    const transports = this.config.transports;
    if (Array.isArray(transports)) {
      const declared = getModelSupportedFormats(this.provider, model);
      const match = declared?.[0] ? transports.find((t) => t.format === declared[0]) : null;
      if (match?.baseUrl) return match.baseUrl;
    }
    // Undeclared model (or no matching transport): chat stays the documented default.
    return `${base}/zen/v1/chat/completions`;
  }

  buildHeaders(credentials, stream = true) {
    const raw = credentials?.rawHeaders || {};
    const lower = {};
    for (const [k, v] of Object.entries(raw)) lower[k.toLowerCase()] = v;

    const downstreamUa = lower["user-agent"] || "";
    const isOpencodeDownstream = downstreamUa.toLowerCase().includes("opencode");

    // opencode upstream now requires a real API key for chat (the catalog is
    // public but chat returns 401 without a key). Use the configured connection
    // API key when present; keep "public" as a fallback for the legacy no-auth
    // path so existing installs don't break.
    const apiKey = credentials?.apiKey || "public";

    return {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "User-Agent": isOpencodeDownstream ? downstreamUa : OPENCODE_UA,
      "x-opencode-client": lower["x-opencode-client"] || "desktop",
      "x-opencode-session": lower["x-opencode-session"] || this._currentSessionId || generateSessionId(),
      "x-opencode-request": lower["x-opencode-request"] || generateRequestId(),
      "x-opencode-project": lower["x-opencode-project"] || "global",
      "Accept": stream ? "text/event-stream" : "*/*",
    };
  }
}
