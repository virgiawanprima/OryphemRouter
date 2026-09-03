import { sanitizeErrorMessage, buildErrorBody } from "../utils/errorSanitize.js";
const TINYFISH_FETCH_URL = "https://api.fetch.tinyfish.ai";
const TINYFISH_TIMEOUT_MS = 3e4;
function mapFormat(format) {
  return format === "html" ? "html" : "markdown";
}
async function tinyfishFetch(opts) {
  const { url, format, includeMetadata, credentials } = opts;
  if (!credentials.apiKey) {
    const body = buildErrorBody(401, "TinyFish API key required");
    return { success: false, status: 401, error: body.error.message };
  }
  const requestBody = {
    urls: [url],
    format: mapFormat(format),
    ttl: 0
  };
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    const err = new Error(`tinyfish-fetch timeout after ${TINYFISH_TIMEOUT_MS}ms`);
    err.name = "TimeoutError";
    controller.abort(err);
  }, TINYFISH_TIMEOUT_MS);
  try {
    const response = await fetch(TINYFISH_FETCH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": credentials.apiKey
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    if (!response.ok) {
      const rawError = await response.text().catch(() => `HTTP ${response.status}`);
      const msg = sanitizeErrorMessage(`TinyFish error ${response.status}: ${rawError}`);
      const body = buildErrorBody(response.status, msg);
      return { success: false, status: response.status, error: body.error.message };
    }
    const data = await response.json();
    const result = data.results?.[0];
    if (!result) {
      const errorEntry = data.errors?.[0];
      const msg = sanitizeErrorMessage(
        errorEntry?.message ?? errorEntry?.error ?? "TinyFish could not fetch the requested URL"
      );
      const body = buildErrorBody(502, msg);
      return { success: false, status: 502, error: body.error.message };
    }
    const metadata = includeMetadata ? {
      title: result.title != null ? String(result.title) : null,
      description: result.description != null ? String(result.description) : null
    } : null;
    return {
      success: true,
      data: {
        provider: "tinyfish",
        url,
        content: String(result.text ?? ""),
        links: [],
        metadata,
        screenshot_url: null
      }
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const body2 = buildErrorBody(504, "TinyFish request timed out");
      return { success: false, status: 504, error: body2.error.message };
    }
    const msg = err instanceof Error ? sanitizeErrorMessage(err.message) : sanitizeErrorMessage(String(err));
    const body = buildErrorBody(502, msg);
    return { success: false, status: 502, error: body.error.message };
  } finally {
    clearTimeout(timeoutId);
  }
}
export {
  tinyfishFetch
};
