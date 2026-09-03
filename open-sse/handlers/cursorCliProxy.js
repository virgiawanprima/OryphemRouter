import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { getApiKeyById, getApiKeyMetadata, validateApiKey } from "../utils/omni/db-apiKeys.js";
import { getProviderConnections } from "../utils/omni/db-providers.js";
import { saveCallLog } from "../utils/omni/usage-callLogs.js";
import { isRequireApiKeyEnabled } from "../utils/omni/shared-featureFlags.js";
import { HTTP_STATUS } from "../config/runtimeConfig.js";
import {
  CURSOR_API_BASE_URL,
  CURSOR_API_KEY_EXCHANGE_PATH,
  CursorApiKeyExchangeError,
  invalidateCursorSessionToken,
  isCursorApiKey,
  resolveCursorBearerToken
} from "../utils/omni/cursorApiKeyAuth.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
const CURSOR_CLI_PROXY_PREFIX = "/api/cursor-cli";
const CURSOR_CLI_SESSION_ISSUER = "omniroute";
const CURSOR_CLI_SESSION_AUDIENCE = "cursor-cli";
const CURSOR_CLI_SESSION_TTL_SECONDS = 60 * 60;
const CURSOR_CLI_REQUEST_TYPE = "cursor-cli";
const ANONYMOUS_SUBJECT = "anonymous";
const PROVIDER_ID = "cursor-api";
const REQUEST_HEADER_DENYLIST = /* @__PURE__ */ new Set([
  "authorization",
  "host",
  "connection",
  "content-length",
  "accept-encoding",
  "keep-alive",
  "proxy-authorization",
  "proxy-connection",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "cookie"
]);
const RESPONSE_HEADER_DENYLIST = /* @__PURE__ */ new Set([
  "connection",
  "content-encoding",
  "content-length",
  "keep-alive",
  "transfer-encoding",
  "set-cookie"
]);
const exchangeBodySchema = z.object({}).passthrough();
const sessionClaimsSchema = z.object({
  sub: z.string().min(1),
  iss: z.literal(CURSOR_CLI_SESSION_ISSUER),
  aud: z.union([
    z.literal(CURSOR_CLI_SESSION_AUDIENCE),
    z.array(z.string()).refine((list) => list.includes(CURSOR_CLI_SESSION_AUDIENCE))
  ]),
  exp: z.number(),
  name: z.string().nullable().optional()
});
const defaultDeps = {
  fetchImpl: (input, init) => fetch(input, init),
  now: () => Date.now(),
  getSecret: () => process.env.JWT_SECRET,
  validateApiKey: (key) => validateApiKey(key),
  getApiKeyMetadata: async (key) => {
    const meta = await getApiKeyMetadata(key);
    return meta ? { id: meta.id, name: meta.name } : null;
  },
  getApiKeyById: (id) => getApiKeyById(id),
  requireApiKey: () => isRequireApiKeyEnabled(),
  listCursorConnections: async () => await getProviderConnections({
    provider: PROVIDER_ID,
    isActive: true
  }),
  resolveBearer: (credentials) => resolveCursorBearerToken(credentials),
  invalidateBearer: (apiKey) => invalidateCursorSessionToken(apiKey),
  saveCallLog: (entry) => saveCallLog(entry),
  upstreamBaseUrl: CURSOR_API_BASE_URL
};
function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
function connectError(status, code, message) {
  return jsonResponse(status, { code, message: sanitizeErrorMessage(message) });
}
function extractBearer(request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}
function secretKey(secret) {
  return new TextEncoder().encode(secret);
}
function normalizeCursorCliPath(segments) {
  return "/" + segments.map((segment) => encodeURIComponent(decodeURIComponent(segment))).join("/");
}
async function authenticateExchange(request, deps) {
  const bearer = extractBearer(request);
  if (bearer && await deps.validateApiKey(bearer)) {
    const meta = await deps.getApiKeyMetadata(bearer);
    return { apiKeyId: meta?.id ?? null, apiKeyName: meta?.name ?? null };
  }
  if (!deps.requireApiKey()) {
    return { apiKeyId: null, apiKeyName: null };
  }
  return connectError(
    HTTP_STATUS.UNAUTHORIZED,
    "unauthenticated",
    "CURSOR_API_KEY must be an OmniRoute API key when OmniRoute requires API keys"
  );
}
async function mintCursorCliSessionToken(principal, secret, nowMs) {
  const nowSeconds = Math.floor(nowMs / 1e3);
  return new SignJWT({ name: principal.apiKeyName }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuer(CURSOR_CLI_SESSION_ISSUER).setAudience(CURSOR_CLI_SESSION_AUDIENCE).setSubject(principal.apiKeyId ?? ANONYMOUS_SUBJECT).setIssuedAt(nowSeconds).setExpirationTime(nowSeconds + CURSOR_CLI_SESSION_TTL_SECONDS).sign(secretKey(secret));
}
async function verifyCursorCliSessionToken(token, secret, nowMs) {
  let payload;
  try {
    ({ payload } = await jwtVerify(token, secretKey(secret), {
      issuer: CURSOR_CLI_SESSION_ISSUER,
      audience: CURSOR_CLI_SESSION_AUDIENCE,
      currentDate: new Date(nowMs)
    }));
  } catch {
    return null;
  }
  const claims = sessionClaimsSchema.safeParse(payload);
  if (!claims.success) return null;
  return {
    apiKeyId: claims.data.sub === ANONYMOUS_SUBJECT ? null : claims.data.sub,
    apiKeyName: claims.data.name ?? null
  };
}
async function isPrincipalStillValid(principal, deps) {
  if (!principal.apiKeyId) return !deps.requireApiKey();
  const row = await deps.getApiKeyById(principal.apiKeyId);
  if (!row) return false;
  if (row.isActive === false) return false;
  return !(typeof row.revokedAt === "string" && row.revokedAt.trim() !== "");
}
function connectionPriority(connection) {
  return typeof connection.priority === "number" ? connection.priority : Number.MAX_SAFE_INTEGER;
}
function isCoolingDown(connection, nowMs) {
  if (typeof connection.rateLimitedUntil !== "string") return false;
  const until = Date.parse(connection.rateLimitedUntil);
  return Number.isFinite(until) && until > nowMs;
}
async function resolveUpstreamConnection(deps) {
  const connections = (await deps.listCursorConnections()).filter((connection) => !isCoolingDown(connection, deps.now())).sort((a, b) => connectionPriority(a) - connectionPriority(b));
  if (connections.length === 0) {
    return connectError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "unavailable",
      "No active Cursor API connection configured in OmniRoute"
    );
  }
  let lastError = null;
  for (const connection of connections) {
    const apiKey = isCursorApiKey(connection.apiKey) ? connection.apiKey : null;
    const accessToken = typeof connection.accessToken === "string" ? connection.accessToken : null;
    try {
      const bearer = await deps.resolveBearer({ apiKey, accessToken });
      return {
        connectionId: typeof connection.id === "string" ? connection.id : null,
        bearer,
        apiKey
      };
    } catch (err) {
      lastError = err;
    }
  }
  const status = lastError instanceof CursorApiKeyExchangeError ? lastError.status : HTTP_STATUS.BAD_GATEWAY;
  const message = lastError instanceof Error ? lastError.message : "Cursor credential unavailable";
  return connectError(
    status,
    status === HTTP_STATUS.UNAUTHORIZED ? "unauthenticated" : "unavailable",
    message
  );
}
function buildUpstreamHeaders(request, bearer) {
  const headers = new Headers();
  request.headers.forEach((value, name) => {
    if (!REQUEST_HEADER_DENYLIST.has(name.toLowerCase())) headers.set(name, value);
  });
  headers.set("authorization", `Bearer ${bearer}`);
  return headers;
}
function buildDownstreamHeaders(upstream) {
  const headers = new Headers();
  upstream.headers.forEach((value, name) => {
    if (!RESPONSE_HEADER_DENYLIST.has(name.toLowerCase())) headers.set(name, value);
  });
  return headers;
}
function recordCall(deps, input) {
  void deps.saveCallLog({
    method: input.method,
    path: `${CURSOR_CLI_PROXY_PREFIX}${input.path}`,
    status: input.status,
    model: "-",
    provider: PROVIDER_ID,
    connectionId: input.connectionId,
    duration: Math.max(0, deps.now() - input.startedAt),
    apiKeyId: input.principal?.apiKeyId ?? null,
    apiKeyName: input.principal?.apiKeyName ?? null,
    requestType: CURSOR_CLI_REQUEST_TYPE,
    sourceFormat: CURSOR_CLI_REQUEST_TYPE,
    targetFormat: CURSOR_CLI_REQUEST_TYPE,
    error: input.error ? { message: sanitizeErrorMessage(input.error) } : null
  }).catch(() => void 0);
}
function streamWithCompletionLog(body, onDone) {
  const reader = body.getReader();
  let settled = false;
  const settle = (error) => {
    if (settled) return;
    settled = true;
    onDone(error);
  };
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          settle();
          controller.close();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        settle(err instanceof Error ? err.message : "upstream stream failed");
        controller.error(err);
      }
    },
    cancel(reason) {
      settle(reason instanceof Error ? reason.message : "stream cancelled");
      return reader.cancel(reason);
    }
  });
}
async function handleExchange(request, startedAt, deps) {
  if (request.method !== "POST") {
    return connectError(405, "unimplemented", "Use POST");
  }
  const rawBody = await request.text();
  if (rawBody.trim().length > 0) {
    let parsed;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return connectError(HTTP_STATUS.BAD_REQUEST, "invalid_argument", "Body must be JSON");
    }
    if (!exchangeBodySchema.safeParse(parsed).success) {
      return connectError(
        HTTP_STATUS.BAD_REQUEST,
        "invalid_argument",
        "Body must be a JSON object"
      );
    }
  }
  const principal = await authenticateExchange(request, deps);
  if (principal instanceof Response) {
    recordCall(deps, {
      method: request.method,
      path: CURSOR_API_KEY_EXCHANGE_PATH,
      status: principal.status,
      startedAt,
      principal: null,
      connectionId: null,
      error: "OmniRoute API key rejected"
    });
    return principal;
  }
  const secret = deps.getSecret();
  if (!secret || secret.trim().length === 0) {
    return connectError(
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      "unavailable",
      "JWT_SECRET is not configured; the Cursor CLI passthrough cannot mint session tokens"
    );
  }
  const token = await mintCursorCliSessionToken(principal, secret, deps.now());
  recordCall(deps, {
    method: request.method,
    path: CURSOR_API_KEY_EXCHANGE_PATH,
    status: 200,
    startedAt,
    principal,
    connectionId: null
  });
  return jsonResponse(200, { accessToken: token, refreshToken: token });
}
async function handleForward(request, path, startedAt, deps) {
  const secret = deps.getSecret();
  const bearer = extractBearer(request);
  const principal = bearer && secret ? await verifyCursorCliSessionToken(bearer, secret, deps.now()) : null;
  if (!principal || !await isPrincipalStillValid(principal, deps)) {
    return connectError(
      HTTP_STATUS.UNAUTHORIZED,
      "unauthenticated",
      "Missing or expired OmniRoute Cursor CLI session token"
    );
  }
  const resolved = await resolveUpstreamConnection(deps);
  if (resolved instanceof Response) {
    recordCall(deps, {
      method: request.method,
      path,
      status: resolved.status,
      startedAt,
      principal,
      connectionId: null,
      error: "No usable Cursor connection"
    });
    return resolved;
  }
  const search = new URL(request.url).search;
  const upstreamUrl = `${deps.upstreamBaseUrl}${path}${search}`;
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  let upstream;
  try {
    upstream = await deps.fetchImpl(upstreamUrl, {
      method: request.method,
      headers: buildUpstreamHeaders(request, resolved.bearer),
      body: hasBody ? request.body : void 0,
      signal: request.signal,
      redirect: "manual",
      ...hasBody ? { duplex: "half" } : {}
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "upstream request failed";
    recordCall(deps, {
      method: request.method,
      path,
      status: HTTP_STATUS.BAD_GATEWAY,
      startedAt,
      principal,
      connectionId: resolved.connectionId,
      error: message
    });
    return connectError(HTTP_STATUS.BAD_GATEWAY, "unavailable", message);
  }
  if (upstream.status === HTTP_STATUS.UNAUTHORIZED && resolved.apiKey) {
    deps.invalidateBearer(resolved.apiKey);
  }
  const logInput = {
    method: request.method,
    path,
    status: upstream.status,
    startedAt,
    principal,
    connectionId: resolved.connectionId
  };
  const headers = buildDownstreamHeaders(upstream);
  if (!upstream.body) {
    recordCall(deps, logInput);
    return new Response(null, { status: upstream.status, headers });
  }
  const body = streamWithCompletionLog(
    upstream.body,
    (error) => recordCall(deps, { ...logInput, error: error ?? null })
  );
  return new Response(body, { status: upstream.status, headers });
}
async function handleCursorCliProxy(request, segments, overrides = {}) {
  const deps = { ...defaultDeps, ...overrides };
  const startedAt = deps.now();
  const path = normalizeCursorCliPath(segments);
  if (path === CURSOR_API_KEY_EXCHANGE_PATH) {
    return handleExchange(request, startedAt, deps);
  }
  return handleForward(request, path, startedAt, deps);
}
export {
  CURSOR_CLI_PROXY_PREFIX,
  CURSOR_CLI_REQUEST_TYPE,
  CURSOR_CLI_SESSION_AUDIENCE,
  CURSOR_CLI_SESSION_ISSUER,
  CURSOR_CLI_SESSION_TTL_SECONDS,
  handleCursorCliProxy,
  mintCursorCliSessionToken,
  normalizeCursorCliPath
};
