import { sanitizeErrorMessage, buildErrorBody } from "../../utils/errorSanitize.js";
const FIRECRAWL_DEFAULT_BASE_URL = "https://api.firecrawl.dev";
const FIRECRAWL_DEFAULT_TIMEOUT_MS = 3e4;
function getFirecrawlBaseUrl(credentials) {
  const envBase = process.env.FIRECRAWL_BASE_URL?.trim();
  if (envBase) return envBase.replace(/\/+$/, "");
  const providerData = credentials?.providerSpecificData;
  const credBase = typeof credentials?.baseUrl === "string" ? credentials.baseUrl : providerData?.baseUrl;
  if (typeof credBase === "string" && credBase.trim()) {
    return credBase.trim().replace(/\/+$/, "");
  }
  return FIRECRAWL_DEFAULT_BASE_URL;
}
function isDefaultFirecrawlBaseUrl(baseUrl) {
  return baseUrl === FIRECRAWL_DEFAULT_BASE_URL;
}
function getFirecrawlTimeoutMs() {
  const raw = process.env.FIRECRAWL_TIMEOUT_MS;
  if (!raw) return FIRECRAWL_DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : FIRECRAWL_DEFAULT_TIMEOUT_MS;
}
function mapFormat(format) {
  switch (format) {
    case "html":
      return "html";
    case "links":
      return "links";
    case "screenshot":
      return "screenshot";
    case "markdown":
    default:
      return "markdown";
  }
}
async function firecrawlFetch(opts) {
  const { url, format, depth, waitForSelector, includeMetadata, credentials } = opts;
  const baseUrl = getFirecrawlBaseUrl(credentials);
  const isDefaultBaseUrl = isDefaultFirecrawlBaseUrl(baseUrl);
  if (isDefaultBaseUrl && !credentials.apiKey) {
    const body = buildErrorBody(401, "Firecrawl API key required");
    return { success: false, status: 401, error: body.error.message };
  }
  const formats = [mapFormat(format)];
  const requestBody = {
    url,
    formats
  };
  if (depth > 0) {
    requestBody.maxDepth = depth;
  }
  if (waitForSelector) {
    requestBody.waitFor = waitForSelector;
  }
  const controller = new AbortController();
  const firecrawlMs = getFirecrawlTimeoutMs();
  const timeoutId = setTimeout(() => {
    const err = new Error(`firecrawl-fetch timeout after ${firecrawlMs}ms`);
    err.name = "TimeoutError";
    controller.abort(err);
  }, firecrawlMs);
  try {
    const headers = { "Content-Type": "application/json" };
    if (credentials.apiKey) {
      headers.Authorization = `Bearer ${credentials.apiKey}`;
    }
    const response = await fetch(`${baseUrl}/v1/scrape`, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: controller.signal
    });
    if (!response.ok) {
      const rawError = await response.text().catch(() => `HTTP ${response.status}`);
      const msg = sanitizeErrorMessage(`Firecrawl error ${response.status}: ${rawError}`);
      const body = buildErrorBody(response.status, msg);
      return { success: false, status: response.status, error: body.error.message };
    }
    const data = await response.json();
    const scraped = data.data ?? {};
    const content = format === "html" ? String(scraped.html ?? "") : format === "links" ? JSON.stringify(scraped.links ?? []) : String(scraped.markdown ?? scraped.content ?? "");
    const rawLinks = scraped.links;
    const links = Array.isArray(rawLinks) ? rawLinks.map((l) => String(l)) : [];
    const rawMeta = scraped.metadata;
    const metadata = includeMetadata ? {
      title: rawMeta?.title != null ? String(rawMeta.title) : null,
      description: rawMeta?.description != null ? String(rawMeta.description) : null
    } : null;
    const screenshotUrl = format === "screenshot" ? scraped.screenshot != null ? String(scraped.screenshot) : null : null;
    return {
      success: true,
      data: {
        provider: "firecrawl",
        url,
        content,
        links,
        metadata,
        screenshot_url: screenshotUrl
      }
    };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      const body2 = buildErrorBody(504, "Firecrawl request timed out");
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
  firecrawlFetch
};
