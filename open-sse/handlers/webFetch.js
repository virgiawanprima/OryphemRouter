import { buildErrorBody, sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { context7Fetch } from "../utils/omni/context7-fetch.js";
import { firecrawlFetch } from "../utils/omni/firecrawl-fetch.js";
import { jinaReaderFetch } from "../utils/omni/jina-reader-fetch.js";
import { tavilyFetch } from "../utils/omni/tavily-fetch.js";
import { tinyfishFetch } from "../utils/omni/tinyfish-fetch.js";
const WEB_FETCH_PROVIDERS = Object.freeze([
  "firecrawl",
  "jina-reader",
  "tavily-search",
  "tinyfish",
  "context7"
]);
const EXPLICIT_ONLY_WEB_FETCH_PROVIDERS = /* @__PURE__ */ new Set(["context7"]);
const ANONYMOUS_CAPABLE_WEB_FETCH_PROVIDERS = /* @__PURE__ */ new Set(["context7"]);
async function handleWebFetch(req, credentials, resolvedProvider) {
  const provider = resolvedProvider ?? req.provider ?? "firecrawl";
  const format = req.format ?? "markdown";
  const includeMetadata = req.include_metadata ?? false;
  try {
    switch (provider) {
      case "firecrawl":
        return await firecrawlFetch({
          url: req.url,
          format,
          depth: req.depth ?? 0,
          waitForSelector: req.wait_for_selector,
          includeMetadata,
          credentials
        });
      case "jina-reader":
        return await jinaReaderFetch({
          url: req.url,
          format,
          includeMetadata,
          credentials
        });
      case "tavily-search":
        return await tavilyFetch({
          url: req.url,
          format,
          includeMetadata,
          credentials
        });
      case "tinyfish":
        return await tinyfishFetch({
          url: req.url,
          format,
          includeMetadata,
          credentials
        });
      case "context7":
        if (req.format && req.format !== "markdown") {
          const body = buildErrorBody(
            400,
            `Provider 'context7' only supports format 'markdown' (llms.txt), got '${req.format}'`
          );
          return { success: false, status: 400, error: body.error.message };
        }
        return await context7Fetch({
          url: req.url,
          includeMetadata,
          credentials
        });
      default: {
        const _exhaustive = provider;
        return {
          success: false,
          status: 400,
          error: `Unknown web fetch provider: ${_exhaustive}`
        };
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? sanitizeErrorMessage(err.message) : sanitizeErrorMessage(String(err));
    const body = buildErrorBody(502, msg);
    return {
      success: false,
      status: 502,
      error: body.error.message
    };
  }
}
export {
  ANONYMOUS_CAPABLE_WEB_FETCH_PROVIDERS,
  EXPLICIT_ONLY_WEB_FETCH_PROVIDERS,
  WEB_FETCH_PROVIDERS,
  handleWebFetch
};
