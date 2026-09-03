import crypto from "node:crypto";
const CURSOR_API_BASE_URL = "https://api2.cursor.sh";
const CURSOR_API_KEY_PREFIX = "crsr_";
const CURSOR_API_KEY_EXCHANGE_PATH = "/auth/exchange_user_api_key";
const CURSOR_API_KEY_EXCHANGE_URL = `${CURSOR_API_BASE_URL}${CURSOR_API_KEY_EXCHANGE_PATH}`;
const REFRESH_SKEW_MS = 5 * 60 * 1e3;
const FALLBACK_TTL_MS = 55 * 60 * 1e3;
const EXCHANGE_TIMEOUT_MS = 15e3;
class CursorApiKeyExchangeError extends Error {
  status;
  constructor(message, status) {
    super(message);
    this.name = "CursorApiKeyExchangeError";
    this.status = status;
  }
}
const sessionCache = /* @__PURE__ */ new Map();
const inflightExchanges = /* @__PURE__ */ new Map();
function isCursorApiKey(value) {
  return typeof value === "string" && value.startsWith(CURSOR_API_KEY_PREFIX);
}
function cacheKeyFor(apiKey) {
  return crypto.createHmac("sha256", "omniroute-cursor-session-cache-fingerprint-v1").update(apiKey).digest("hex");
}
function readJwtExpiryMs(token) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp * 1e3 : null;
  } catch {
    return null;
  }
}
function parseExchangeBody(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new CursorApiKeyExchangeError("Cursor API key exchange returned a non-JSON body", 502);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new CursorApiKeyExchangeError("Cursor API key exchange returned an empty body", 502);
  }
  const { accessToken, refreshToken } = parsed;
  if (typeof accessToken !== "string" || accessToken.length === 0) {
    throw new CursorApiKeyExchangeError("Cursor API key exchange returned no accessToken", 502);
  }
  return {
    accessToken,
    refreshToken: typeof refreshToken === "string" && refreshToken.length > 0 ? refreshToken : null
  };
}
async function exchangeCursorApiKey(apiKey, options = {}) {
  if (!isCursorApiKey(apiKey)) {
    throw new CursorApiKeyExchangeError(
      `Cursor API keys start with "${CURSOR_API_KEY_PREFIX}"`,
      400
    );
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const signal = options.signal ?? AbortSignal.timeout(EXCHANGE_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(CURSOR_API_KEY_EXCHANGE_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        accept: "application/json"
      },
      body: "{}",
      signal
    });
  } catch {
    throw new CursorApiKeyExchangeError("Cursor API key exchange request failed", 502);
  }
  if (response.status === 401 || response.status === 403) {
    throw new CursorApiKeyExchangeError("Cursor rejected the API key", 401);
  }
  if (!response.ok) {
    throw new CursorApiKeyExchangeError(
      `Cursor API key exchange failed with HTTP ${response.status}`,
      response.status >= 500 ? 502 : response.status
    );
  }
  const { accessToken, refreshToken } = parseExchangeBody(await response.text());
  const expiresAt = readJwtExpiryMs(accessToken) ?? now() + FALLBACK_TTL_MS;
  return { accessToken, refreshToken, expiresAt };
}
function isFresh(token, nowMs) {
  return token.expiresAt - REFRESH_SKEW_MS > nowMs;
}
async function resolveCursorSessionToken(apiKey, options = {}) {
  const now = options.now ?? Date.now;
  const key = cacheKeyFor(apiKey);
  const cached = sessionCache.get(key);
  if (cached && isFresh(cached, now())) return cached;
  const pending = inflightExchanges.get(key);
  if (pending) return pending;
  const exchange = exchangeCursorApiKey(apiKey, options).then((token) => {
    sessionCache.set(key, token);
    return token;
  }).finally(() => {
    inflightExchanges.delete(key);
  });
  inflightExchanges.set(key, exchange);
  return exchange;
}
function invalidateCursorSessionToken(apiKey) {
  sessionCache.delete(cacheKeyFor(apiKey));
}
function stripCursorOAuthTokenPrefix(accessToken) {
  return accessToken.includes("::") ? accessToken.split("::")[1] : accessToken;
}
async function resolveCursorBearerToken(credentials, options = {}) {
  if (isCursorApiKey(credentials.apiKey)) {
    const session = await resolveCursorSessionToken(credentials.apiKey, options);
    return session.accessToken;
  }
  if (typeof credentials.accessToken === "string" && credentials.accessToken.length > 0) {
    return stripCursorOAuthTokenPrefix(credentials.accessToken);
  }
  throw new CursorApiKeyExchangeError(
    "Cursor connection has neither an API key nor a session token",
    401
  );
}
function __resetCursorApiKeyAuthForTest() {
  sessionCache.clear();
  inflightExchanges.clear();
}
export {
  CURSOR_API_BASE_URL,
  CURSOR_API_KEY_EXCHANGE_PATH,
  CURSOR_API_KEY_EXCHANGE_URL,
  CURSOR_API_KEY_PREFIX,
  CursorApiKeyExchangeError,
  __resetCursorApiKeyAuthForTest,
  exchangeCursorApiKey,
  invalidateCursorSessionToken,
  isCursorApiKey,
  readJwtExpiryMs,
  resolveCursorBearerToken,
  resolveCursorSessionToken,
  stripCursorOAuthTokenPrefix
};
