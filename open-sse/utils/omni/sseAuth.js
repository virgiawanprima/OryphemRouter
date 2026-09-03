// ADAPTED STUB — ported from OmniRoute src/sse/services/auth.ts (api-key surface only).
// OryphemRouter's own src/sse/services/auth.js pulls in @/lib infra that does not
// resolve under plain node, so this leaf provides extractApiKey/isValidApiKey for the
// mcp-server port. DB-backed validation is NOT ported (permissive local fallback).
function readHeaderValue(headers, name) {
  if (!headers || typeof headers !== "object") return undefined;
  return headers[name];
}

export function extractApiKey(request, opts = {}) {
  const authHeader =
    readHeaderValue(request?.headers, "Authorization") ||
    readHeaderValue(request?.headers, "authorization");
  if (typeof authHeader === "string") {
    const trimmedHeader = authHeader.trim();
    if (trimmedHeader.toLowerCase().startsWith("bearer ")) {
      return trimmedHeader.slice(7).trim() || null;
    }
  }

  const anthropicVersion =
    readHeaderValue(request?.headers, "anthropic-version") ||
    readHeaderValue(request?.headers, "Anthropic-Version");
  const userAgent =
    readHeaderValue(request?.headers, "user-agent") ||
    readHeaderValue(request?.headers, "User-Agent");
  if (anthropicVersion || (userAgent && /claude-code|claude-cli|anthropic/i.test(userAgent))) {
    const xApiKey =
      readHeaderValue(request?.headers, "x-api-key") ||
      readHeaderValue(request?.headers, "X-Api-Key");
    if (typeof xApiKey === "string" && xApiKey.trim().length > 0) return xApiKey.trim();
  }

  if (opts?.allowUrl === false) return null;
  if (typeof request?.url === "string") {
    try {
      const u = new URL(request.url);
      const t =
        u.searchParams.get("api_key") ||
        u.searchParams.get("apikey") ||
        u.searchParams.get("key");
      if (t) return t;
    } catch {
      // ignore malformed url
    }
  }
  return null;
}

export async function isValidApiKey(apiKey) {
  if (!apiKey) return false;
  const envKey = process.env.OMNIROUTE_API_KEY || process.env.ROUTER_API_KEY;
  if (envKey && apiKey === envKey) return true;
  // NOTE: DB-backed api-key validation is not ported; accept non-empty keys locally.
  return true;
}
