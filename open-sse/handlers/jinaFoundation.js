import { CORS_HEADERS } from "../utils/omni/cors.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { attachOmniRouteMetaHeaders } from "../utils/omni/omnirouteResponseMeta.js";
import { generateRequestId } from "../utils/omni/requestId.js";
import { saveCallLog } from "../utils/omni/usageDb.js";
async function handleJinaFoundationProxy(options) {
  const startTime = Date.now();
  const provider = options.provider || "jina-ai";
  const token = options.credentials?.apiKey || options.credentials?.accessToken;
  const connectionId = options.credentials?.connectionId || null;
  if (!token) {
    return errorResponse(401, `No credentials for Jina provider: ${provider}`);
  }
  try {
    const res = await fetch(options.upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(options.body)
    });
    const text = await res.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { error: text.slice(0, 500) };
    }
    saveCallLog({
      method: "POST",
      path: options.path,
      status: res.status,
      model: options.model || `${provider}${options.path}`,
      provider,
      duration: Date.now() - startTime,
      tokens: { prompt_tokens: 0, completion_tokens: 0 },
      connectionId,
      ...res.ok ? {} : {
        error: parsed?.message || parsed?.error?.message || text.slice(0, 500)
      }
    }).catch(() => {
    });
    if (!res.ok) {
      const err = parsed;
      const message = err?.message || (typeof err?.error === "string" ? err.error : err?.error?.message) || `Provider returned HTTP ${res.status}`;
      return errorResponse(res.status, message);
    }
    const headers = new Headers({ ...CORS_HEADERS, "Content-Type": "application/json" });
    attachOmniRouteMetaHeaders(headers, {
      provider,
      model: options.model || provider,
      costUsd: 0,
      latencyMs: Date.now() - startTime,
      requestId: generateRequestId()
    });
    return new Response(JSON.stringify(parsed), { status: 200, headers });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(500, `Jina request failed: ${message}`);
  }
}
export {
  handleJinaFoundationProxy
};
