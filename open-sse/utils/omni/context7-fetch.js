import { sanitizeErrorMessage, buildErrorBody } from "../../utils/errorSanitize.js";
const CONTEXT7_API_BASE = "https://context7.com/api/v1";
const CONTEXT7_TIMEOUT_MS = 1e4;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const DEFAULT_TOKENS = 5e3;
const MAX_TOKENS = 2e4;
function isValidContext7LibraryId(id) {
  if (typeof id !== "string") return false;
  const seg = /^[A-Za-z0-9][\w-]*(?:\.[\w-]+)*$/;
  const m = /^\/(.+)\/(.+)$/.exec(id);
  return m !== null && seg.test(m[1]) && seg.test(m[2]);
}
function parseContext7LibraryUrl(input) {
  if (typeof input !== "string") return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  let pathAndQuery = trimmed;
  const hostMatch = trimmed.match(/^(?:https?:\/\/)?(?:www\.)?context7\.com(\/.*)?$/i);
  if (hostMatch) {
    pathAndQuery = hostMatch[1] ?? "";
  } else if (/^https?:\/\//i.test(trimmed)) {
    return null;
  } else if (!pathAndQuery.startsWith("/")) {
    pathAndQuery = `/${pathAndQuery}`;
  }
  const qIndex = pathAndQuery.indexOf("?");
  const path = qIndex === -1 ? pathAndQuery : pathAndQuery.slice(0, qIndex);
  const query = qIndex === -1 ? "" : pathAndQuery.slice(qIndex + 1);
  const libMatch = path.match(/^\/([\w.-]+)\/([\w.-]+)\/?$/);
  if (!libMatch) return null;
  if (!isValidContext7LibraryId(`/${libMatch[1]}/${libMatch[2]}`)) return null;
  const libraryId = `/${libMatch[1]}/${libMatch[2]}`;
  let topic;
  let tokens;
  if (query) {
    const qp = new URLSearchParams(query);
    const rawTopic = qp.get("topic");
    if (rawTopic) topic = rawTopic.slice(0, 200);
    const rawTokens = qp.get("tokens");
    if (rawTokens && /^\d+$/.test(rawTokens)) {
      tokens = Math.min(Math.max(parseInt(rawTokens, 10), 100), MAX_TOKENS);
    }
  }
  return { libraryId, ...topic && { topic }, ...tokens !== void 0 && { tokens } };
}
async function readBodyCapped(response, maxBytes) {
  if (response.body) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    let truncated2 = false;
    for (; ; ) {
      let step;
      try {
        step = await reader.read();
      } catch {
        truncated2 = true;
        break;
      }
      const { done, value } = step;
      if (done) break;
      if (total + value.byteLength > maxBytes) {
        chunks.push(value.subarray(0, Math.max(0, maxBytes - total)));
        total = maxBytes;
        truncated2 = true;
        await reader.cancel().catch(() => {
        });
        break;
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const buf2 = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      buf2.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { text: new TextDecoder().decode(buf2), truncated: truncated2 };
  }
  const buf = new Uint8Array(await response.arrayBuffer());
  const truncated = buf.byteLength > maxBytes;
  const slice = truncated ? buf.subarray(0, maxBytes) : buf;
  return { text: new TextDecoder().decode(slice), truncated };
}
async function context7Fetch(opts) {
  const { url, includeMetadata, credentials } = opts;
  const parsed = parseContext7LibraryUrl(url);
  if (!parsed) {
    const body = buildErrorBody(
      400,
      'Context7 fetch expects a library reference such as "https://context7.com/reactjs/react.dev" or "/reactjs/react.dev", optionally with ?topic=<t>&tokens=<n>'
    );
    return { success: false, status: 400, error: body.error.message };
  }
  const qp = new URLSearchParams({ type: "llms.txt" });
  if (parsed.topic) qp.set("topic", parsed.topic);
  qp.set("tokens", String(parsed.tokens ?? DEFAULT_TOKENS));
  const rawBase = (credentials.baseUrl ?? "").trim().replace(/\/+$/, "");
  const apiBase = /^https?:\/\/[\w][\w-]*(\.[\w][\w-]*)*(:\d{1,5})?(\/[\w./-]*)?$/.test(rawBase) && !rawBase.includes("../") ? rawBase : CONTEXT7_API_BASE;
  const requestUrl = `${apiBase}${parsed.libraryId}?${qp}`;
  const headers = { Accept: "text/plain" };
  if (credentials.apiKey) {
    headers.Authorization = `Bearer ${credentials.apiKey}`;
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONTEXT7_TIMEOUT_MS);
  try {
    const response = await fetch(requestUrl, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!response.ok) {
      const { text: rawError } = await readBodyCapped(response, MAX_BODY_BYTES).catch(() => ({
        text: `HTTP ${response.status}`
      }));
      const msg = sanitizeErrorMessage(
        `Context7 error ${response.status}: ${rawError.slice(0, 500)}`
      );
      const body = buildErrorBody(response.status, msg);
      return { success: false, status: response.status, error: body.error.message };
    }
    const { text: content, truncated } = await readBodyCapped(response, MAX_BODY_BYTES);
    return {
      success: true,
      data: {
        provider: "context7",
        // Canonical form: the caller's input may be a bare "/owner/repo" or
        // a full URL; downstream consumers get the normalized context7.com
        // URL (consistent with the search normalizer).
        url: `https://context7.com${parsed.libraryId}`,
        content,
        links: [],
        metadata: includeMetadata ? {
          title: `Context7 docs: ${parsed.libraryId}`,
          description: null,
          ...truncated ? { truncated: true } : {}
        } : null,
        screenshot_url: null
      }
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const body2 = buildErrorBody(504, "Context7 request timed out");
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
  context7Fetch,
  isValidContext7LibraryId,
  parseContext7LibraryUrl
};
