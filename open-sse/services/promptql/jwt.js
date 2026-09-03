function readStr(v) {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length ? t : "";
}
function readPs(data, keys) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return "";
  const rec = data;
  for (const k of keys) {
    const v = readStr(rec[k]);
    if (v) return v;
  }
  return "";
}
function normalizePromptQlToken(raw) {
  const t = raw.trim().replace(/^Bearer\s+/i, "").trim();
  return t;
}
function decodeJwtPayload(token) {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    return JSON.parse(json);
  } catch {
    return null;
  }
}
function looksLikeUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (value || "").trim()
  );
}
function extractProjectIdFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return "";
  const hasura = payload["https://promptql.hasura.io"];
  if (hasura && typeof hasura === "object" && !Array.isArray(hasura)) {
    const id = readStr(hasura["x-hasura-project-id"]);
    if (id && looksLikeUuid(id)) return id;
    if (id) return id;
  }
  const direct = readStr(payload.project_id) || readStr(payload.projectId);
  if (direct) return direct;
  const aud = payload.aud;
  if (typeof aud === "string" && looksLikeUuid(aud)) return aud.trim();
  if (Array.isArray(aud)) {
    for (const a of aud) {
      if (typeof a === "string" && looksLikeUuid(a)) return a.trim();
    }
  }
  return "";
}
function isPlaygroundPromptQlToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const hasura = payload["https://promptql.hasura.io"];
  if (hasura && typeof hasura === "object" && !Array.isArray(hasura)) {
    const id = hasura["x-hasura-project-id"];
    if (typeof id === "string" && id.trim()) return true;
  }
  const iss = readStr(payload.iss).toLowerCase();
  if (iss === "enrich-token" || iss.includes("enrich-token")) return true;
  const aud = payload.aud;
  if (typeof aud === "string" && aud.toLowerCase() === "promptql.hasura.io") return true;
  return false;
}
const TRUSTED_DDN_ISSUER_HOSTS = ["auth.pro.hasura.io", "auth.pro.ql.app"];
function issuerHostIsTrusted(iss) {
  try {
    const host = new URL(iss).hostname.toLowerCase();
    return TRUSTED_DDN_ISSUER_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}
function isDdnProjectPromptQlToken(token) {
  if (!token || isPlaygroundPromptQlToken(token)) return false;
  const payload = decodeJwtPayload(token);
  if (!payload) return false;
  const iss = readStr(payload.iss);
  if (issuerHostIsTrusted(iss)) return true;
  const aud = payload.aud;
  if (typeof aud === "string" && looksLikeUuid(aud)) return true;
  return false;
}
function isJwtExpired(token, skewSec = 30) {
  const payload = decodeJwtPayload(token);
  const exp = payload && typeof payload.exp === "number" ? payload.exp : 0;
  if (!exp) return false;
  return Math.floor(Date.now() / 1e3) >= exp - skewSec;
}
const DEFAULT_TZ = "UTC";
function resolvePromptQlCredentials(credentials) {
  const credRec = credentials;
  const direct = readStr(credentials?.apiKey) || readStr(credRec?.accessToken) || readStr(credRec?.token);
  const ps = credentials?.providerSpecificData;
  const token = normalizePromptQlToken(
    direct || readPs(ps, ["token", "jwt", "accessToken", "bearer", "apiKey"])
  );
  const projectId = readPs(ps, ["projectId", "project_id", "x-hasura-project-id"]) || readStr(credRec?.projectId) || readStr(credRec?.project_id) || extractProjectIdFromToken(token);
  const cookie = readPs(ps, ["cookie", "sessionCookie", "authCookie"]);
  const timezone = readPs(ps, ["timezone", "tz"]) || DEFAULT_TZ;
  return { token, projectId, cookie, timezone };
}
export {
  decodeJwtPayload,
  extractProjectIdFromToken,
  isDdnProjectPromptQlToken,
  isJwtExpired,
  isPlaygroundPromptQlToken,
  issuerHostIsTrusted,
  looksLikeUuid,
  normalizePromptQlToken,
  resolvePromptQlCredentials
};
