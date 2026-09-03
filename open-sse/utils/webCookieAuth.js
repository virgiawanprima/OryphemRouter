function stripCookieInputPrefix(rawValue) {
  const trimmed = (rawValue || "").trim();
  if (!trimmed) return "";
  const withoutBearer = trimmed.replace(/^bearer\s+/i, "");
  return withoutBearer.replace(/^cookie:/i, "").trim();
}
function parseJsonCookiesToHeader(rawValue) {
  const trimmed = (rawValue || "").trim();
  if (!trimmed || !trimmed.startsWith("[")) return null;
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;
  if (parsed.length === 0) return "";
  const parts = [];
  for (let i = 0; i < parsed.length; i++) {
    const entry = parsed[i];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      throw new Error(`Invalid cookie JSON at index ${i}: expected an object`);
    }
    const record = entry;
    if (typeof record.name !== "string" || !record.name) {
      throw new Error(`Invalid cookie JSON at index ${i}: missing required field 'name'`);
    }
    if (typeof record.value !== "string") {
      throw new Error(`Invalid cookie JSON at index ${i}: missing required field 'value'`);
    }
    parts.push(`${record.name}=${record.value}`);
  }
  return parts.join("; ");
}
function normalizeSessionCookieHeader(rawValue, defaultCookieName) {
  const stripped = stripCookieInputPrefix(rawValue);
  if (!stripped) return "";
  const jsonResult = parseJsonCookiesToHeader(stripped);
  if (jsonResult !== null) {
    return jsonResult;
  }
  if (stripped.includes("=")) {
    return stripped;
  }
  return `${defaultCookieName}=${stripped}`;
}
function extractCookieValue(rawValue, cookieName) {
  const trimmed = stripCookieInputPrefix(rawValue);
  if (!trimmed) return "";
  if (trimmed.includes(";")) {
    const escaped = cookieName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = trimmed.match(new RegExp("(?:^|;\\s*)" + escaped + "=([^;\\s]+)"));
    return match ? match[1] : "";
  }
  const prefix = `${cookieName}=`;
  if (trimmed.startsWith(prefix)) return trimmed.slice(prefix.length);
  return trimmed;
}
function buildGrokCookieHeader(rawValue) {
  const sso = extractCookieValue(rawValue, "sso");
  if (!sso) return "";
  const parts = [`sso=${sso}`];
  for (const name of ["sso-rw", "cf_clearance", "__cf_bm"]) {
    if (new RegExp("(?:^|;\\s*)" + name + "=").test(rawValue)) {
      const value = extractCookieValue(rawValue, name);
      if (value) parts.push(`${name}=${value}`);
    }
  }
  return parts.join("; ");
}
function buildQwenCookieHeader(rawValue) {
  const trimmed = stripCookieInputPrefix(rawValue);
  if (!trimmed || !trimmed.includes("=")) return "";
  return trimmed;
}
function extractQwenToken(rawValue) {
  const trimmed = stripCookieInputPrefix(rawValue);
  if (!trimmed) return "";
  if (!trimmed.includes("=")) return trimmed;
  const match = trimmed.match(/(?:^|;\s*)token=([^;\s]+)/);
  return match ? match[1] : "";
}
function extractKimiAccessToken(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      const access = parsed?.access_token || parsed?.token || "";
      if (access && typeof access === "string") return access.trim();
    } catch {
    }
  }
  const bearer = raw.match(/^(?:authorization:\s*)?bearer\s+([^;\s]+)/i);
  if (bearer) return bearer[1];
  const trimmed = stripCookieInputPrefix(raw);
  for (const key of ["access_token", "kimi-auth"]) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = trimmed.match(new RegExp(`(?:^|[\\s;])${escaped}=([^;\\s]+)`));
    if (match) return match[1];
  }
  return !trimmed.includes("=") && !trimmed.includes(";") ? trimmed : "";
}
function extractKimiRefreshToken(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return "";
  if (raw.startsWith("{") && raw.endsWith("}")) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.refresh_token && typeof parsed.refresh_token === "string") {
        return parsed.refresh_token.trim();
      }
    } catch {
    }
  }
  const match = raw.match(/(?:^|[\s;])refresh_token=([^;\s]+)/);
  if (match) return match[1];
  return "";
}
function extractKimiCredentials(rawValue) {
  const raw = String(rawValue ?? "").trim();
  if (!raw) return { accessToken: "", refreshToken: "" };
  return {
    accessToken: extractKimiAccessToken(raw),
    refreshToken: extractKimiRefreshToken(raw)
  };
}
function extractKimiJwt(rawValue) {
  return extractKimiAccessToken(rawValue);
}
function normalizeSessionCookieHeaders(rawValues, defaultCookieName) {
  const seen = /* @__PURE__ */ new Set();
  const normalizedHeaders = [];
  for (const rawValue of rawValues) {
    if (typeof rawValue !== "string") continue;
    const normalized = normalizeSessionCookieHeader(rawValue, defaultCookieName);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedHeaders.push(normalized);
  }
  return normalizedHeaders;
}
export {
  buildGrokCookieHeader,
  buildQwenCookieHeader,
  extractCookieValue,
  extractKimiAccessToken,
  extractKimiCredentials,
  extractKimiJwt,
  extractKimiRefreshToken,
  extractQwenToken,
  normalizeSessionCookieHeader,
  normalizeSessionCookieHeaders,
  parseJsonCookiesToHeader,
  stripCookieInputPrefix
};
