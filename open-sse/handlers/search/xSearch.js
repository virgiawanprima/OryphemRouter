const X_SEARCH_PROVIDER_ID = "x-search";
const DEFAULT_X_SEARCH_MODEL = "grok-4.6";
const X_SEARCH_RESPONSES_URL = "https://api.x.ai/v1/responses";
const X_POST_URL_RE = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/status\/(\d+)/i;
const X_PROFILE_URL_RE = /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/?#]+)\/?$/i;
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function timeRangeToFromDate(timeRange) {
  if (!timeRange || timeRange === "any" || timeRange === "hour") return void 0;
  const now = Date.now();
  const day = 24 * 60 * 60 * 1e3;
  const deltas = {
    day,
    week: 7 * day,
    month: 30 * day,
    year: 365 * day
  };
  const delta = deltas[timeRange];
  if (!delta) return void 0;
  return new Date(now - delta).toISOString().slice(0, 10);
}
function handlesFromDomainFilter(domainFilter) {
  if (!domainFilter?.length) return void 0;
  const handles = domainFilter.filter((d) => !d.startsWith("-")).map((d) => d.replace(/^@/, "").replace(/^(?:www\.)?(?:x|twitter)\.com\//i, "").split("/")[0]).filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h)).slice(0, 20);
  return handles.length ? handles : void 0;
}
function titleFromXUrl(url) {
  const post = url.match(X_POST_URL_RE);
  if (post) return `@${post[1]}`;
  const profile = url.match(X_PROFILE_URL_RE);
  if (profile && !["i", "intent", "share", "search"].includes(profile[1].toLowerCase())) {
    return `@${profile[1]}`;
  }
  return "X post";
}
function addUrl(urls, seen, raw) {
  if (typeof raw !== "string") return;
  const url = raw.trim();
  if (!url.startsWith("http")) return;
  if (seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}
function walkForUrls(value, urls, seen, depth = 0) {
  if (depth > 8 || value == null) return;
  if (typeof value === "string") {
    if (/^https?:\/\//.test(value) && /(?:x|twitter)\.com\//i.test(value)) {
      addUrl(urls, seen, value);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walkForUrls(item, urls, seen, depth + 1);
    return;
  }
  const rec = asRecord(value);
  if (!rec) return;
  for (const key of ["url", "uri", "href", "source"]) {
    addUrl(urls, seen, rec[key]);
  }
  for (const nested of Object.values(rec)) walkForUrls(nested, urls, seen, depth + 1);
}
function extractXSearchHits(data, query, maxResults) {
  const rec = asRecord(data) ?? {};
  const urls = [];
  const seen = /* @__PURE__ */ new Set();
  if (Array.isArray(rec.citations)) {
    for (const c of rec.citations) addUrl(urls, seen, c);
  }
  walkForUrls(rec.output, urls, seen);
  walkForUrls(rec.output_text, urls, seen);
  let snippet = "";
  if (typeof rec.output_text === "string") snippet = rec.output_text.trim();
  if (!snippet && Array.isArray(rec.output)) {
    for (const item of rec.output) {
      const row = asRecord(item);
      if (!row) continue;
      if (typeof row.text === "string" && row.text.trim()) {
        snippet = row.text.trim();
        break;
      }
      if (Array.isArray(row.content)) {
        for (const part of row.content) {
          const p = asRecord(part);
          if (p && typeof p.text === "string" && p.text.trim()) {
            snippet = p.text.trim();
            break;
          }
        }
      }
      if (snippet) break;
    }
  }
  if (!snippet) snippet = query;
  const xUrls = urls.filter((u) => /(?:x|twitter)\.com\//i.test(u));
  const chosen = (xUrls.length ? xUrls : urls).slice(0, maxResults);
  return chosen.map((url) => ({
    title: titleFromXUrl(url),
    url,
    snippet: snippet.slice(0, 500),
    author: titleFromXUrl(url).startsWith("@") ? titleFromXUrl(url).slice(1) : void 0
  }));
}
function buildXSearchRequest(config, params) {
  const model = typeof params.providerSpecificData?.model === "string" && params.providerSpecificData.model.trim() || typeof params.providerOptions?.model === "string" && params.providerOptions.model.trim() || DEFAULT_X_SEARCH_MODEL;
  const tool = { type: "x_search" };
  const fromDate = timeRangeToFromDate(params.timeRange);
  if (fromDate) tool.from_date = fromDate;
  const handles = handlesFromDomainFilter(params.domainFilter);
  if (handles) tool.allowed_x_handles = handles;
  const url = (config.baseUrl || X_SEARCH_RESPONSES_URL).replace(/\/+$/, "");
  return {
    url,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...params.token ? { Authorization: `Bearer ${params.token}` } : {}
      },
      body: JSON.stringify({
        model,
        stream: false,
        input: params.query,
        tools: [tool]
      })
    }
  };
}
export {
  DEFAULT_X_SEARCH_MODEL,
  X_SEARCH_PROVIDER_ID,
  X_SEARCH_RESPONSES_URL,
  buildXSearchRequest,
  extractXSearchHits,
  titleFromXUrl
};
