const GITLAB_DUO_DEFAULT_BASE_URL = process.env.GITLAB_DUO_BASE_URL || process.env.GITLAB_BASE_URL || "https://gitlab.com";
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function normalizeGitLabBaseUrl(baseUrl) {
  const raw = typeof baseUrl === "string" ? baseUrl.trim() : "";
  return (raw || GITLAB_DUO_DEFAULT_BASE_URL).replace(/\/$/, "");
}
function resolveGitLabOAuthBaseUrl(providerSpecificData) {
  const data = asRecord(providerSpecificData);
  return normalizeGitLabBaseUrl(data.baseUrl);
}
function buildGitLabOAuthEndpoints(baseUrl) {
  const root = normalizeGitLabBaseUrl(baseUrl);
  return {
    root,
    authorizeUrl: `${root}/oauth/authorize`,
    tokenUrl: `${root}/oauth/token`,
    userUrl: `${root}/api/v4/user`,
    directAccessUrl: `${root}/api/v4/code_suggestions/direct_access`,
    publicCompletionsUrl: `${root}/api/v4/code_suggestions/completions`
  };
}
function buildGitLabDirectGatewayUrl(baseUrl) {
  const normalized = normalizeGitLabBaseUrl(baseUrl);
  if (normalized.endsWith("/ai/v2/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/ai/v2")) {
    return `${normalized}/completions`;
  }
  return `${normalized}/ai/v2/completions`;
}
function parseGitLabDirectAccessDetails(payload) {
  const data = asRecord(payload);
  const token = typeof data.token === "string" ? data.token.trim() : "";
  const baseUrl = typeof data.base_url === "string" ? data.base_url.trim() : "";
  if (!token || !baseUrl) {
    return null;
  }
  const rawHeaders = asRecord(data.headers);
  const headers = Object.fromEntries(
    Object.entries(rawHeaders).filter(
      (entry) => typeof entry[0] === "string" && typeof entry[1] === "string"
    )
  );
  const expiresAt = typeof data.expires_at === "number" && Number.isFinite(data.expires_at) ? new Date(data.expires_at * 1e3).toISOString() : null;
  return {
    token,
    baseUrl: normalizeGitLabBaseUrl(baseUrl),
    expiresAt,
    headers
  };
}
function getCachedGitLabDirectAccess(providerSpecificData, minValidityMs = 6e4) {
  const data = asRecord(providerSpecificData);
  const cache = data.gitlabDirectAccess ?? data.directAccessCache;
  const parsed = parseGitLabDirectAccessDetails(cache);
  if (!parsed) {
    return null;
  }
  if (!parsed.expiresAt) {
    return parsed;
  }
  const expiresAtMs = new Date(parsed.expiresAt).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now() + minValidityMs) {
    return null;
  }
  return parsed;
}
function isGitLabDirectAccessDisabled(status, bodyText) {
  return status === 403 && bodyText.toLowerCase().includes("direct connections are disabled");
}
function shouldFallbackToPublicCodeSuggestions(status, bodyText) {
  return status === 401 || isGitLabDirectAccessDisabled(status, bodyText);
}
function buildGitLabDuoProbeHeaders(token) {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    ...token ? { Authorization: `Bearer ${token}` } : {}
  };
}
function buildGitLabDuoProbeBody() {
  return {
    current_file: {
      file_name: "connection-test.txt",
      content_above_cursor: "",
      content_below_cursor: ""
    },
    intent: "generation",
    generation_type: "small_file",
    stream: false
  };
}
export {
  GITLAB_DUO_DEFAULT_BASE_URL,
  buildGitLabDirectGatewayUrl,
  buildGitLabDuoProbeBody,
  buildGitLabDuoProbeHeaders,
  buildGitLabOAuthEndpoints,
  getCachedGitLabDirectAccess,
  isGitLabDirectAccessDisabled,
  normalizeGitLabBaseUrl,
  parseGitLabDirectAccessDetails,
  resolveGitLabOAuthBaseUrl,
  shouldFallbackToPublicCodeSuggestions
};
