import { BaseExecutor } from "./base.js";


import { PROVIDERS } from "./executorConstants.js";
import { getModelTargetFormat } from "../config/providerModels.js";
import { isResponsesEndpointPath } from "../utils/omni/responsesEndpoint.js";
import { chatRequestToXaiResponses } from "../utils/omni/xaiOpenaiChat.js";
import { capXaiRequestHistory } from "../utils/omni/xaiMessageCap.js";
const REASONING_ALLOWED = ["grok-4.3", "grok-4.20-0309-reasoning"];
const REASONING_DENIED = ["grok-build-0.1", "grok-4.20-0309-non-reasoning"];
const EFFORT_SUFFIXES = ["low", "medium", "high", "xhigh"];
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
class XaiExecutor extends BaseExecutor {
  constructor(provider = "xai") {
    super(provider, PROVIDERS[provider]);
  }
  buildUrl(model, _stream, _urlIndex = 0, credentials = null) {
    if (getModelTargetFormat(this.provider, model) === "openai-responses") {
      return this.config.responsesBaseUrl || this.config.baseUrl;
    }
    if (isResponsesEndpointPath(credentials?.requestEndpointPath)) {
      return this.config.responsesBaseUrl || this.config.baseUrl;
    }
    return this.config.baseUrl;
  }
  async refreshCredentials(credentials, log) {
    if (this.provider !== "xai-oauth" || !credentials.refreshToken) return null;
    try {
      const response = await fetch(this.config.tokenUrl || "https://auth.x.ai/oauth2/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: this.config.clientId || "",
          refresh_token: credentials.refreshToken
        })
      });
      if (!response.ok) {
        log?.warn?.("TOKEN_REFRESH", `xAI OAuth refresh failed with status ${response.status}`);
        return null;
      }
      const data = await response.json();
      if (!data.access_token) {
        log?.warn?.("TOKEN_REFRESH", "xAI OAuth refresh response omitted access_token");
        return null;
      }
      const expiresIn = Number(data.expires_in) || 21600;
      return {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || credentials.refreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1e3).toISOString()
      };
    } catch (error) {
      log?.warn?.(
        "TOKEN_REFRESH",
        `xAI OAuth refresh error: ${error instanceof Error ? error.message : String(error)}`
      );
      return null;
    }
  }
  transformRequest(model, body, stream, credentials) {
    const cleaned = super.transformRequest(model, body, stream, credentials);
    const record = asRecord(cleaned);
    if (!record) return cleaned;
    let out = { ...record };
    const nativeXaiPassthrough = record._nativeXaiResponsesPassthrough === true;
    delete out._nativeXaiResponsesPassthrough;
    delete out._nativeCodexPassthrough;
    const useResponses = nativeXaiPassthrough || getModelTargetFormat(this.provider, model) === "openai-responses" || isResponsesEndpointPath(credentials?.requestEndpointPath);
    if (useResponses) {
      if (Array.isArray(out.messages) && out.input == null) {
        out = chatRequestToXaiResponses(out);
      } else {
        if (out.max_completion_tokens != null && out.max_output_tokens == null) {
          out.max_output_tokens = out.max_completion_tokens;
          delete out.max_completion_tokens;
        }
        if (out.max_tokens != null && out.max_output_tokens == null) {
          out.max_output_tokens = out.max_tokens;
          delete out.max_tokens;
        }
        if (out.response_format != null && out.text == null) {
          out.text = { format: out.response_format };
          delete out.response_format;
        }
      }
      if (out.model == null && model) out.model = model;
      return capXaiRequestHistory(out);
    }
    let modelId = typeof out.model === "string" ? out.model : model;
    let suffixEffort = null;
    for (const level of EFFORT_SUFFIXES) {
      const suffix = `-${level}`;
      if (modelId.endsWith(suffix)) {
        suffixEffort = level;
        modelId = modelId.slice(0, -suffix.length);
        break;
      }
    }
    if (suffixEffort && typeof out.model === "string") {
      out.model = modelId;
    }
    const isDenied = REASONING_DENIED.some((id) => modelId.includes(id));
    const isAllowed = REASONING_ALLOWED.some((id) => modelId.includes(id));
    if (isDenied) {
      delete out.reasoning_effort;
    } else if (isAllowed) {
      const effort = suffixEffort || out.reasoning_effort;
      if (effort) out.reasoning_effort = effort;
    }
    return capXaiRequestHistory(out);
  }
}
var xai_default = XaiExecutor;
export {
  XaiExecutor,
  xai_default as default
};
