import { saveCallLog } from "./omni/usageDb.js";
import { sanitizeErrorMessage } from "./errorSanitize.js";
function isSegmindFailure(result) {
  return !result.ok;
}
async function logSegmindFailure(opts, status, duration, errorText) {
  if (opts.log) {
    opts.log.error(
      opts.scope,
      `${opts.provider} error ${status}: ${errorText.slice(0, 200)}`
    );
  }
  saveCallLog({
    method: "POST",
    path: opts.callLogPath,
    status,
    model: `${opts.provider}/${opts.model}`,
    provider: opts.provider,
    duration,
    error: errorText.slice(0, 500)
  }).catch(() => {
  });
  return {
    ok: false,
    status,
    error: sanitizeErrorMessage(errorText) || `Segmind request failed (${status})`
  };
}
async function segmindRequest(opts) {
  const startTime = Date.now();
  try {
    const response = await fetch(`${opts.baseUrl.replace(/\/$/, "")}/${opts.model}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": opts.token },
      body: JSON.stringify(opts.upstreamBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      return logSegmindFailure(opts, response.status, Date.now() - startTime, errorText);
    }
    const contentType = response.headers.get("content-type") || "";
    const buffer = Buffer.from(await response.arrayBuffer());
    saveCallLog({
      method: "POST",
      path: opts.callLogPath,
      status: 200,
      model: `${opts.provider}/${opts.model}`,
      provider: opts.provider,
      duration: Date.now() - startTime
    }).catch(() => {
    });
    return { ok: true, buffer, contentType };
  } catch (err) {
    const message = err?.message ?? String(err);
    if (opts.log) opts.log.error(opts.scope, `${opts.provider} fetch error: ${message}`);
    saveCallLog({
      method: "POST",
      path: opts.callLogPath,
      status: 502,
      model: `${opts.provider}/${opts.model}`,
      provider: opts.provider,
      duration: Date.now() - startTime,
      error: message
    }).catch(() => {
    });
    return {
      ok: false,
      status: 502,
      error: `${opts.scope === "IMAGE" ? "Image" : "Video"} provider error: ${sanitizeErrorMessage(message)}`
    };
  }
}
export {
  isSegmindFailure,
  segmindRequest
};
