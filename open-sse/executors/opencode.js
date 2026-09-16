import crypto from "crypto";
import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "../config/providers.js";
import { getModelSupportedFormats } from "../config/providerModels.js";
import { FORMATS } from "../translator/formats.js";
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

  buildUrl(model) {
    const base = this.config.baseUrl;
    // Transport is resolved from metadata, never from a hardcoded model list. This
    // executor used to carry `const MESSAGES_MODELS = new Set()` and branch on it:
    // an empty allowlist that silently pinned EVERY model to /chat/completions —
    // the same "hardcode the matcher instead of reading the declaration" mistake
    // that routed opencode-go's /responses-only models to chat in 9Router.
    //
    // Zen ships a dynamic catalog (registry `passthroughModels`, no per-model
    // entries), so today no model declares the claude format and the chat endpoint
    // stays the default — identical behavior, but driven by the declaration. Add
    // per-model `supportedFormats` (or `transports` on the registry entry) and the
    // /messages route activates on its own.
    //
    // OPEN: whether zen's claude-format models even have a /zen/v1/messages endpoint
    // is unverified (the upstream catalog reports ids only). Probe it before relying
    // on it — tracked in Projek/oryphemrouter.
    const transports = this.config.transports;
    const claudeTransport = Array.isArray(transports)
      ? transports.find((t) => t.format === FORMATS.CLAUDE)
      : null;
    const declared = getModelSupportedFormats(this.provider, model);
    if (claudeTransport && declared?.includes(FORMATS.CLAUDE)) {
      return claudeTransport.baseUrl || `${base}/zen/v1/messages`;
    }
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
