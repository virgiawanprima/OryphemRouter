import { createHash, randomUUID } from "node:crypto";
import { normalizeCodexSessionId } from "./codexClient.js";
import { isCrossAccountCodexTurnState, readCodexTurnStateHeader } from "./codexTurnState.js";
const CODEX_INSTALLATION_SALT = "omniroute-codex-installation";
const CODEX_SESSION_SEED_PREFIX = "omniroute:codex-session-id:v1:";
const CODEX_THREAD_SEED_PREFIX = "omniroute:codex-thread-id:v1:";
const CODEX_INSTALLATION_SEED_PREFIX_V2 = "omniroute:codex-installation:v2:";
const CODEX_SESSION_SEED_PREFIX_V2 = "omniroute:codex-session-id:v2:";
const CODEX_THREAD_SEED_PREFIX_V2 = "omniroute:codex-thread-id:v2:";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CODEX_FINGERPRINT_MODES = ["off", "device", "session", "full"];
const CODEX_FINGERPRINT_MODE_KEY = "codexFingerprintMode";
const CODEX_FINGERPRINT_SEED_KEY = "codexFingerprintSeed";
function normalizeUuid(value) {
  return typeof value === "string" && UUID_PATTERN.test(value.trim()) ? value.trim() : null;
}
function nonEmptyString(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}
function uuidFromLegacyInstallationValue(value) {
  const hash = createHash("sha256").update(value).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
function deriveStableUUIDv4(seed) {
  const digest = createHash("sha256").update(seed).digest();
  const bytes = Buffer.from(digest.subarray(0, 16));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  return [
    bytes.subarray(0, 4).toString("hex"),
    bytes.subarray(4, 6).toString("hex"),
    bytes.subarray(6, 8).toString("hex"),
    bytes.subarray(8, 10).toString("hex"),
    bytes.subarray(10, 16).toString("hex")
  ].join("-");
}
function accountSeed(providerSpecificData, accountKey) {
  return nonEmptyString(accountKey) || nonEmptyString(providerSpecificData?.connectionId) || nonEmptyString(providerSpecificData?.workspaceId) || nonEmptyString(providerSpecificData?.accountId) || nonEmptyString(providerSpecificData?.email) || "default";
}
function getCodexFingerprintSeed(providerSpecificData) {
  return normalizeUuid(providerSpecificData?.[CODEX_FINGERPRINT_SEED_KEY]);
}
function codexFingerprintModeRequiresSeed(mode) {
  return mode === "device" || mode === "session" || mode === "full";
}
function ensureCodexFingerprintSeed(providerSpecificData, credentials, existingProviderSpecificData) {
  const psd = { ...providerSpecificData || {} };
  delete psd[CODEX_FINGERPRINT_SEED_KEY];
  if (!isCodexOAuthCredentials(credentials)) {
    return Object.keys(psd).length > 0 ? psd : void 0;
  }
  const existingSeed = getCodexFingerprintSeed(existingProviderSpecificData);
  if (existingSeed) {
    psd[CODEX_FINGERPRINT_SEED_KEY] = existingSeed;
    return psd;
  }
  const mode = getCodexFingerprintMode(psd, true);
  if (codexFingerprintModeRequiresSeed(mode)) {
    psd[CODEX_FINGERPRINT_SEED_KEY] = randomUUID();
    return psd;
  }
  return Object.keys(psd).length > 0 ? psd : void 0;
}
function readNamedHeader(headers, name) {
  if (!headers) return "";
  if (headers instanceof Headers) return headers.get(name)?.trim() || "";
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted && typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}
function isCodexOAuthCredentials(credentials) {
  return Boolean(
    nonEmptyString(credentials?.accessToken) || nonEmptyString(credentials?.refreshToken)
  );
}
function getCodexFingerprintMode(providerSpecificData, isOAuth = true) {
  if (!isOAuth) return "off";
  const raw = (nonEmptyString(providerSpecificData?.[CODEX_FINGERPRINT_MODE_KEY]) || nonEmptyString(providerSpecificData?.codex_fingerprint_mode) || "").toLowerCase();
  return CODEX_FINGERPRINT_MODES.includes(raw) ? raw : "session";
}
function getCodexInstallationId(providerSpecificData, accountKey) {
  const explicit = normalizeUuid(providerSpecificData?.codexInstallationId);
  if (explicit) return explicit;
  const persistedSeed = getCodexFingerprintSeed(providerSpecificData);
  if (persistedSeed) {
    return deriveStableUUIDv4(`${CODEX_INSTALLATION_SEED_PREFIX_V2}${persistedSeed}`);
  }
  const legacyStableSource = nonEmptyString(providerSpecificData?.workspaceId) || nonEmptyString(providerSpecificData?.accountId) || nonEmptyString(providerSpecificData?.email);
  if (legacyStableSource) {
    return uuidFromLegacyInstallationValue(`${CODEX_INSTALLATION_SALT}:${legacyStableSource}`);
  }
  return deriveStableUUIDv4(
    `${CODEX_INSTALLATION_SALT}:${accountSeed(providerSpecificData, accountKey)}`
  );
}
function getCodexConvergedSessionId(providerSpecificData, accountKey) {
  const persistedSeed = getCodexFingerprintSeed(providerSpecificData);
  if (persistedSeed) {
    return deriveStableUUIDv4(`${CODEX_SESSION_SEED_PREFIX_V2}${persistedSeed}`);
  }
  return deriveStableUUIDv4(
    `${CODEX_SESSION_SEED_PREFIX}${accountSeed(providerSpecificData, accountKey)}`
  );
}
function getCodexConvergedThreadId(clientSessionId, providerSpecificData, accountKey) {
  if (!nonEmptyString(clientSessionId)) return "";
  const persistedSeed = getCodexFingerprintSeed(providerSpecificData);
  if (persistedSeed) {
    return deriveStableUUIDv4(`${CODEX_THREAD_SEED_PREFIX_V2}${persistedSeed}:${clientSessionId}`);
  }
  return deriveStableUUIDv4(
    `${CODEX_THREAD_SEED_PREFIX}${accountSeed(providerSpecificData, accountKey)}:${clientSessionId}`
  );
}
function getCodexClientSessionId(headers) {
  return normalizeCodexSessionId(readNamedHeader(headers, "session-id")) || normalizeCodexSessionId(readNamedHeader(headers, "session_id")) || null;
}
function resolveCodexTurnStateEcho(clientHeaders, accountKey) {
  const value = readCodexTurnStateHeader(clientHeaders);
  if (!value) return null;
  const sessionId = getCodexClientSessionId(clientHeaders);
  if (sessionId && isCrossAccountCodexTurnState(sessionId, accountKey)) return null;
  return value;
}
function createCodexClientIdentity(clientSessionId, providerSpecificData, options = {}) {
  const mode = options.mode ?? getCodexFingerprintMode(providerSpecificData, options.isOAuth ?? true);
  if (mode === "off") return null;
  const installationId = getCodexInstallationId(providerSpecificData, options.accountKey);
  if (mode === "device") {
    return {
      mode,
      installationId,
      sessionId: "",
      threadId: "",
      turnId: "",
      windowId: "",
      turnStartedAtUnixMs: Date.now()
    };
  }
  const sessionId = getCodexConvergedSessionId(providerSpecificData, options.accountKey);
  const threadId = mode === "full" ? sessionId : getCodexConvergedThreadId(clientSessionId, providerSpecificData, options.accountKey) || sessionId;
  return {
    mode,
    installationId,
    sessionId,
    threadId,
    turnId: randomUUID(),
    windowId: `${threadId}:0`,
    turnStartedAtUnixMs: Date.now()
  };
}
function isCompactRequestEndpoint(path) {
  if (typeof path !== "string") return false;
  const normalized = path.trim().toLowerCase().replace(/\\/g, "/");
  return normalized === "/compact" || /(?:^|\/)responses\/compact(?:\/|$)/.test(normalized);
}
const CODEX_IDENTITY_HEADER_NAMES = [
  "session-id",
  "session_id",
  "thread-id",
  "thread_id",
  "x-client-request-id",
  "x-codex-installation-id",
  "x-codex-window-id",
  "x-codex-turn-metadata"
];
function resolveCodexOriginalIdentityHeaders(input) {
  const credentials = input.credentials;
  if (!credentials || isCompactRequestEndpoint(credentials.requestEndpointPath)) return null;
  const providerSpecificData = credentials.providerSpecificData ?? null;
  if (!isCodexOAuthCredentials(credentials) || getCodexFingerprintMode(providerSpecificData, true) !== "off") {
    return null;
  }
  const result = {};
  for (const name of CODEX_IDENTITY_HEADER_NAMES) {
    const value = readNamedHeader(input.clientHeaders, name);
    if (value) result[name] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}
function resolveCodexFingerprintIdentity(input) {
  const credentials = input.credentials;
  if (!credentials || isCompactRequestEndpoint(credentials.requestEndpointPath)) return null;
  const providerSpecificData = credentials.providerSpecificData ?? null;
  const isOAuth = isCodexOAuthCredentials(credentials);
  if (getCodexFingerprintMode(providerSpecificData, isOAuth) === "off") return null;
  return createCodexClientIdentity(
    getCodexClientSessionId(input.clientHeaders),
    providerSpecificData,
    {
      accountKey: credentials.connectionId ?? null,
      isOAuth
    }
  );
}
function withCodexFingerprintCredentials(credentials, clientHeaders, body) {
  const identity = resolveCodexFingerprintIdentity({ credentials, clientHeaders, body });
  const original = resolveCodexOriginalIdentityHeaders({ credentials, clientHeaders });
  const turnStateEcho = credentials ? resolveCodexTurnStateEcho(clientHeaders, credentials.connectionId ?? null) : null;
  if (!identity && !original && !turnStateEcho) return credentials;
  return {
    ...credentials,
    providerSpecificData: {
      ...credentials.providerSpecificData || {},
      ...identity ? { codexClientIdentity: identity } : {},
      ...original ? { codexOriginalIdentityHeaders: original } : {},
      ...turnStateEcho ? { codexTurnStateEcho: turnStateEcho } : {}
    }
  };
}
function mergeTurnMetadata(raw, identity, includeSessionFields) {
  let metadata = {};
  let hadExisting = false;
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        metadata = parsed;
        hadExisting = true;
      }
    } catch {
    }
  }
  if (!hadExisting && includeSessionFields) {
    metadata.thread_source = "user";
    metadata.sandbox = "none";
  }
  metadata.installation_id = identity.installationId;
  if (includeSessionFields) {
    metadata.session_id = identity.sessionId;
    metadata.thread_id = identity.threadId || identity.sessionId;
    metadata.turn_id = identity.turnId;
    metadata.window_id = identity.windowId;
    metadata.turn_started_at_unix_ms = identity.turnStartedAtUnixMs;
  }
  return JSON.stringify(metadata);
}
function applyCodexOriginalIdentityHeaders(headers, original) {
  if (!original) return;
  for (const name of CODEX_IDENTITY_HEADER_NAMES) {
    const value = original[name];
    if (typeof value === "string" && value) headers[name] = value;
  }
}
function applyCodexClientIdentityHeaders(headers, identity) {
  if (!identity) return;
  headers["x-codex-installation-id"] = identity.installationId;
  if (identity.mode === "device") {
    if (headers["x-codex-turn-metadata"] !== void 0) {
      headers["x-codex-turn-metadata"] = mergeTurnMetadata(
        headers["x-codex-turn-metadata"],
        identity,
        false
      );
    }
    return;
  }
  headers["session-id"] = identity.sessionId;
  headers["session_id"] = identity.sessionId;
  headers["thread-id"] = identity.threadId || identity.sessionId;
  headers["x-client-request-id"] = identity.threadId || identity.sessionId;
  headers["x-codex-window-id"] = identity.windowId;
  headers["x-codex-turn-metadata"] = mergeTurnMetadata(
    headers["x-codex-turn-metadata"],
    identity,
    true
  );
}
function applyCodexClientMetadata(body, identity) {
  if (!identity) return;
  const existing = body.client_metadata && typeof body.client_metadata === "object" && !Array.isArray(body.client_metadata) ? { ...body.client_metadata } : {};
  existing["x-codex-installation-id"] = identity.installationId;
  if (identity.mode !== "device") {
    existing.session_id = identity.sessionId;
    existing.thread_id = identity.threadId || identity.sessionId;
    existing.turn_id = identity.turnId;
    existing["x-codex-window-id"] = identity.windowId;
  }
  if (existing["x-codex-turn-metadata"] !== void 0) {
    existing["x-codex-turn-metadata"] = mergeTurnMetadata(
      existing["x-codex-turn-metadata"],
      identity,
      identity.mode !== "device"
    );
  }
  body.client_metadata = existing;
}
function isCodexOriginatedHeaders(headers) {
  const getHeader = (name) => {
    if (headers instanceof Headers) {
      return headers.get(name)?.toLowerCase() ?? "";
    }
    if (headers && typeof headers === "object") {
      for (const [key, value] of Object.entries(headers)) {
        if (key.toLowerCase() === name && typeof value === "string") {
          return value.toLowerCase();
        }
      }
    }
    return "";
  };
  if (getHeader("originator").startsWith("codex")) return true;
  return getHeader("user-agent").startsWith("codex");
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function hasNativeCodexTurnBinding(body) {
  const metadata = asRecord(asRecord(body)?.client_metadata);
  const raw = metadata?.["x-codex-turn-metadata"];
  let turn = asRecord(raw);
  if (typeof raw === "string") {
    try {
      turn = asRecord(JSON.parse(raw));
    } catch {
      return false;
    }
  }
  return typeof turn?.thread_id === "string" && turn.thread_id.trim().length > 0 && typeof turn.turn_id === "string" && turn.turn_id.trim().length > 0;
}
function isVerifiedNativeCodexRequest(body, headers) {
  return isCodexOriginatedHeaders(headers) && hasNativeCodexTurnBinding(body);
}
export {
  CODEX_FINGERPRINT_MODES,
  CODEX_FINGERPRINT_MODE_KEY,
  CODEX_FINGERPRINT_SEED_KEY,
  applyCodexClientIdentityHeaders,
  applyCodexClientMetadata,
  applyCodexOriginalIdentityHeaders,
  codexFingerprintModeRequiresSeed,
  createCodexClientIdentity,
  deriveStableUUIDv4,
  ensureCodexFingerprintSeed,
  getCodexClientSessionId,
  getCodexConvergedSessionId,
  getCodexConvergedThreadId,
  getCodexFingerprintMode,
  getCodexFingerprintSeed,
  getCodexInstallationId,
  hasNativeCodexTurnBinding,
  isCodexOAuthCredentials,
  isCodexOriginatedHeaders,
  isVerifiedNativeCodexRequest,
  resolveCodexFingerprintIdentity,
  resolveCodexOriginalIdentityHeaders,
  resolveCodexTurnStateEcho,
  withCodexFingerprintCredentials
};
