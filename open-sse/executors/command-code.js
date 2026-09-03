import { PROVIDERS } from "../config/providers.js";
import { BaseExecutor } from "./base.js";
import { mergeUpstreamExtraHeaders } from "./executorUtils.js";
import { log, sanitize } from "../utils/log.js";
const MAX_COMMAND_CODE_TOKENS = 2e5;
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function clampMaxTokens(value) {
  const numeric = numberValue(value);
  if (numeric === void 0 || numeric <= 0) return void 0;
  return Math.min(Math.floor(numeric), MAX_COMMAND_CODE_TOKENS);
}
const COMMAND_CODE_BARE_MODEL_VENDOR_PREFIX = {
  // Xiaomi MiMo V2.5 — a CC-served vision model not in the registry.
  "mimo-v2.5": "xiaomi/mimo-v2.5",
  "mimo-v2.5-pro": "xiaomi/mimo-v2.5-pro"
};
function normalizeCommandCodeWireModel(model) {
  const trimmed = String(model || "").trim();
  if (!trimmed) return trimmed;
  const bare = trimmed.replace(/^(?:command-code|cmd)\//, "");
  if (bare.includes("/")) return bare;
  return COMMAND_CODE_BARE_MODEL_VENDOR_PREFIX[bare] ?? bare;
}
function buildOpenAiBody(model, body, stream) {
  const input = isRecord(body) ? { ...body } : {};
  const resolvedModel = normalizeCommandCodeWireModel(
    typeof input.model === "string" && input.model.trim().length > 0 ? input.model : model
  );
  const out = {
    ...input,
    model: resolvedModel,
    stream: stream === true
  };
  const maxTokens = clampMaxTokens(input.max_tokens ?? input.max_completion_tokens);
  delete out.max_tokens;
  delete out.max_completion_tokens;
  if (maxTokens !== void 0) {
    out.max_tokens = maxTokens;
  }
  return { body: out };
}

// Minimal local port of OmniRoute's sanitizeReasoningEffortForProvider for the
// command-code provider. OryphemRouter's base.js does not export this helper,
// and the omni stub (../utils/omni/reasoningEffort.js) is a neutral passthrough.
// Command Code rejects `minimal` outright (Validation error: Invalid option,
// expected one of "low"|"medium"|"high"|"xhigh"|"max") and accepts the literal
// top tier `max` (while the shared standardization stage may represent the
// client's `max` as the internal `xhigh`). So: minimal → low, xhigh → max.
function sanitizeReasoningEffortForProvider(body, provider, model) {
  if (provider !== "command-code" || !body || typeof body !== "object" || Array.isArray(body)) {
    return body;
  }
  const b = body;
  let carrier = null;
  if (Object.prototype.hasOwnProperty.call(b, "reasoning_effort")) {
    carrier = { key: "reasoning_effort" };
  } else if (
    b.reasoning &&
    typeof b.reasoning === "object" &&
    Object.prototype.hasOwnProperty.call(b.reasoning, "effort")
  ) {
    carrier = { key: "reasoning" };
  } else if (
    b.output_config &&
    typeof b.output_config === "object" &&
    Object.prototype.hasOwnProperty.call(b.output_config, "effort")
  ) {
    carrier = { key: "output_config" };
  }
  if (!carrier) return body;
  const effortValue =
    carrier.key === "reasoning_effort"
      ? b.reasoning_effort
      : carrier.key === "reasoning"
        ? b.reasoning.effort
        : b.output_config.effort;
  if (typeof effortValue !== "string") return body;
  const effortStr = effortValue.toLowerCase();
  const mapped = effortStr === "minimal" ? "low" : effortStr === "xhigh" ? "max" : null;
  if (!mapped) return body;
  const next = { ...b };
  if (carrier.key === "reasoning_effort") {
    next.reasoning_effort = mapped;
  } else if (carrier.key === "reasoning") {
    next.reasoning = { ...b.reasoning, effort: mapped };
  } else {
    next.output_config = { ...b.output_config, effort: mapped };
  }
  return next;
}

class CommandCodeExecutor extends BaseExecutor {
  constructor(provider = "command-code") {
    super(provider, PROVIDERS["command-code"]);
  }
  buildUrl() {
    const baseUrl = (this.config.baseUrl || "https://api.commandcode.ai").replace(/\/$/, "");
    return `${baseUrl}${this.config.chatPath || "/provider/v1/chat/completions"}`;
  }
  async execute({ model, body, stream, credentials, signal, upstreamExtraHeaders }) {
    const apiKey = credentials?.apiKey || credentials?.accessToken;
    if (!apiKey) throw new Error("Command Code API key required");
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: stream ? "text/event-stream" : "application/json"
    };
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    const sanitizedBody = sanitizeReasoningEffortForProvider(body, this.provider, model);
    const { body: transformedBody } = buildOpenAiBody(model, sanitizedBody, stream);
    const url = this.buildUrl();
    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(transformedBody),
      signal: signal || void 0
    });
    if (!upstream.ok) {
      const errorText = await upstream.text().catch(() => {
        log.warn("COMMAND-CODE", "upstream text failed");
        return "";
      });
      return {
        response: new Response(errorText || `Command Code API error ${upstream.status}`, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers
        }),
        url,
        headers,
        transformedBody
      };
    }
    return { response: upstream, url, headers, transformedBody };
  }
}
export {
  CommandCodeExecutor
};
