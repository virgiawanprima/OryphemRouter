import { CORS_HEADERS } from "./cors.js";
function extractUpstreamErrorMessage(parsed) {
  const detail = parsed?.detail;
  const candidates = [
    parsed?.err_msg,
    parsed?.error?.message,
    typeof parsed?.error === "string" ? parsed.error : null,
    parsed?.message,
    typeof detail === "string" ? detail : detail?.message
  ];
  const raw = candidates.find(Boolean);
  return raw ? String(raw) : null;
}
function upstreamErrorResponse(res, errText) {
  let errorMessage;
  try {
    const parsed = JSON.parse(errText);
    errorMessage = extractUpstreamErrorMessage(parsed) || errText || `Upstream error (${res.status})`;
  } catch {
    errorMessage = errText || `Upstream error (${res.status})`;
  }
  return Response.json(
    { error: { message: errorMessage, code: res.status } },
    {
      status: res.status,
      headers: { ...CORS_HEADERS }
    }
  );
}
function audioStreamResponse(res, defaultContentType = "audio/mpeg") {
  const contentType = res.headers.get("content-type") || defaultContentType;
  return new Response(res.body, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": contentType,
      "Transfer-Encoding": "chunked"
    }
  });
}
export {
  audioStreamResponse,
  upstreamErrorResponse
};
