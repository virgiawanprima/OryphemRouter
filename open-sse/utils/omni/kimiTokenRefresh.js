// Minimal self-contained adaptation of OmniRoute src/lib/kimi/tokenRefresh.ts
// for OryphemRouter. Implements the refresh-token exchange without the app
// database (refreshKimiProviderConnection is omitted).

function parseKimiJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;
  try {
    const payloadJson = Buffer.from(parts[1], "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (typeof payload !== "object" || payload === null) return null;
    return payload;
  } catch {
    return null;
  }
}

function sanitizeErrorMessage(message) {
  return String(message ?? "");
}

export function getKimiWebBaseUrl() {
  const envUrl = process.env.KIMI_WEB_BASE_URL?.trim();
  if (envUrl) return envUrl.replace(/\/+$/, "");
  return "https://www.kimi.ai";
}

/**
 * Exchange a Kimi refresh token for a fresh access token against
 * {baseUrl}/api/auth/token/refresh.
 */
export async function exchangeKimiRefreshToken(refreshToken, baseUrl) {
  const cleanRefresh = String(refreshToken ?? "").trim();
  if (!cleanRefresh) {
    return { success: false, error: "No refresh_token provided" };
  }

  const effectiveBaseUrl = (baseUrl || getKimiWebBaseUrl()).replace(/\/+$/, "");
  const refreshUrl = `${effectiveBaseUrl}/api/auth/token/refresh`;

  try {
    const resp = await fetch(refreshUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cleanRefresh}`,
        Accept: "application/json, text/plain, */*",
        Origin: effectiveBaseUrl,
        Referer: `${effectiveBaseUrl}/`,
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      },
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => "");
      return {
        success: false,
        error: `Kimi refresh returned HTTP ${resp.status}: ${sanitizeErrorMessage(errText)}`,
      };
    }

    const data = await resp.json();
    const newAccess = data?.access_token;
    const newRefresh = data?.refresh_token || cleanRefresh;

    if (!newAccess || typeof newAccess !== "string") {
      return { success: false, error: "Invalid response from Kimi: missing access_token" };
    }

    const parsedJwt = parseKimiJwt(newAccess);
    const expiresAtSec = parsedJwt?.exp || Math.floor(Date.now() / 1000) + 900;

    return {
      success: true,
      accessToken: newAccess,
      refreshToken: newRefresh,
      expiresAtSec,
    };
  } catch (err) {
    return {
      success: false,
      error: `Network error refreshing Kimi token: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}
