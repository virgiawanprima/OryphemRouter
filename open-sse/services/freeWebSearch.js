import { safeOutboundFetch } from "../utils/omni/safeOutboundFetch.js";
const DUCKDUCKGO_LITE_URL = "https://lite.duckduckgo.com/lite/";
const DDG_USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0 Safari/537.36";
const ANCHOR_RE = /<a\b([^>]*?class=['"][^'"]*result-link[^'"]*['"][^>]*)>([\s\S]{0,512}?)<\/a>/gi;
const HREF_RE = /href=['"]([^'"]+)['"]/i;
const SNIPPET_RE = /<td\b[^>]*?class=['"][^'"]*result-snippet[^'"]*['"][^>]*>([\s\S]{0,2048}?)<\/td>/gi;
const MAX_HTML_BYTES = 256 * 1024;
function decodeEntities(text) {
  return text.replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#0*39;|&#x0*27;|&apos;/gi, "'").replace(/&amp;/gi, "&");
}
function stripTags(html) {
  let text = decodeEntities(html);
  let previous;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, "");
  } while (text !== previous);
  text = text.replace(/<[^>]*$/, "");
  return text.replace(/\s+/g, " ").trim();
}
function resolveResultUrl(href) {
  let candidate = href;
  const redirect = href.match(/[?&]uddg=([^&]+)/);
  if (redirect) {
    try {
      candidate = decodeURIComponent(redirect[1]);
    } catch {
      candidate = href;
    }
  } else if (href.startsWith("//")) {
    candidate = `https:${href}`;
  }
  return /^https?:\/\//i.test(candidate) ? candidate : "";
}
function parseDuckDuckGoLite(rawHtml) {
  if (!rawHtml) return [];
  const html = rawHtml.length > MAX_HTML_BYTES ? rawHtml.slice(0, MAX_HTML_BYTES) : rawHtml;
  const snippets = [...html.matchAll(SNIPPET_RE)].map((m) => stripTags(m[1]));
  const results = [];
  let index = 0;
  for (const match of html.matchAll(ANCHOR_RE)) {
    const attrs = match[1];
    const inner = match[2];
    const hrefMatch = attrs.match(HREF_RE);
    const title = stripTags(inner);
    if (hrefMatch && title) {
      const url = resolveResultUrl(hrefMatch[1]);
      if (url) results.push({ url, title, snippet: snippets[index] ?? "" });
    }
    index += 1;
  }
  return results;
}
async function freeWebSearch(query, maxResults = 5, timeoutMs = 1e4) {
  const response = await safeOutboundFetch(DUCKDUCKGO_LITE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": DDG_USER_AGENT,
      Accept: "text/html"
    },
    body: new URLSearchParams({ q: query }).toString(),
    guard: "public-only",
    // Keep redirects manual: the public-only guard only validates the initial URL,
    // so following a 3xx could reach an internal host. DDG lite answers POST with 200.
    allowRedirect: false,
    timeoutMs
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo lite search returned HTTP ${response.status}`);
  }
  const html = await response.text();
  return parseDuckDuckGoLite(html).slice(0, Math.max(1, maxResults));
}
export {
  freeWebSearch,
  parseDuckDuckGoLite
};
