import { FORMATS } from "../translator/formats.js";
import { buildErrorBody } from "./errorSanitize.js";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toStreamFailureStatus(value) {
  if (typeof value === "number" && Number.isInteger(value) && value >= 400 && value <= 599) {
    return value;
  }
  if (typeof value === "string" && /^\d{3}$/.test(value.trim())) {
    const parsed = Number(value.trim());
    return parsed >= 400 && parsed <= 599 ? parsed : null;
  }
  return null;
}
function looksLikeStreamRateLimit(code, type, message) {
  const haystack = `${code} ${type} ${message}`.toLowerCase();
  return haystack.includes("usage_limit_reached") || haystack.includes("rate_limit") || haystack.includes("rate limit") || haystack.includes("quota") || haystack.includes("too many requests") || haystack.includes("limit reached") || haystack.includes("limit has been reached");
}
function normalizeStreamFailurePayload(payload) {
  const record = payload && typeof payload === "object" ? payload : {};
  const response = asRecord(record.response);
  const error = Object.keys(asRecord(response.error)).length ? asRecord(response.error) : Object.keys(asRecord(record.error)).length ? asRecord(record.error) : record;
  const code = typeof error.code === "string" ? error.code : "upstream_error";
  const type = typeof error.type === "string" ? error.type : void 0;
  const message = typeof error.message === "string" && error.message.trim() ? error.message : typeof record.message === "string" && record.message.trim() ? record.message : "Upstream failure";
  const status = toStreamFailureStatus(error.status_code) ?? toStreamFailureStatus(error.status) ?? toStreamFailureStatus(response.status_code) ?? toStreamFailureStatus(response.status) ?? toStreamFailureStatus(record.status_code) ?? toStreamFailureStatus(record.status) ?? (looksLikeStreamRateLimit(code, type || "", message) ? 429 : 502);
  return {
    status,
    message,
    code,
    ...type ? { type } : {}
  };
}
function formatTranslatedStreamError(payload, sourceFormat) {
  const failure = normalizeStreamFailurePayload(payload) ?? {
    status: 502,
    message: "Upstream stream error",
    code: "stream_error",
    type: "server_error"
  };
  const errorBody = buildErrorBody(failure.status, failure.message, void 0, {
    type: failure.type ?? "server_error",
    code: failure.code ?? "stream_error"
  });
  if (sourceFormat === FORMATS.OPENAI_RESPONSES) {
    const failed = {
      type: "response.failed",
      response: {
        id: `resp_error_${Date.now()}`,
        object: "response",
        created_at: Math.floor(Date.now() / 1e3),
        status: "failed",
        background: false,
        error: errorBody.error,
        output: []
      },
      sequence_number: 0
    };
    return `event: response.failed
data: ${JSON.stringify(failed)}

`;
  }
  if (sourceFormat === FORMATS.CLAUDE) {
    return `event: error
data: ${JSON.stringify({ type: "error", error: errorBody.error })}

`;
  }
  return `data: ${JSON.stringify(errorBody)}

data: [DONE]

`;
}
export {
  formatTranslatedStreamError,
  normalizeStreamFailurePayload
};
