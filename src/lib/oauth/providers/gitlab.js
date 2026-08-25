import { GITLAB_CONFIG } from "../constants/oauth.js";
import { assertPublicUrl, isPrivateHost } from "@/shared/utils/ssrfGuard.js";

// meta.baseUrl is supplied by the client and interpolated into server-side
// fetch() calls that carry the OAuth client_secret + authorization code. It
// must be validated before use so it can never point at an attacker-controlled
// or internal/metadata host (https://attacker/, http://127.0.0.1:PORT,
// http://169.254.169.254/, ...).
function assertGitlabBaseUrlSync(baseUrl) {
  let parsed;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw new Error("Invalid GitLab base URL");
  }

  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === "localhost" || host === "127.0.0.1" || host === "::1";

  // Must be https; allow http ONLY for localhost/127.0.0.1 (local dev GitLab).
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopback)) {
    throw new Error("Invalid GitLab base URL");
  }

  // Host must be gitlab.com or a private/local hostname (self-hosted GitLab).
  // This rejects arbitrary public attacker-controlled hosts (e.g. https://attacker/).
  if (host !== "gitlab.com" && !isPrivateHost(host)) {
    throw new Error("Invalid GitLab base URL");
  }

  return parsed.origin;
}

async function assertValidGitlabBaseUrl(baseUrl) {
  const origin = assertGitlabBaseUrlSync(baseUrl);
  // Final SSRF gate: blocks loopback/private/link-local/metadata IPs
  // (127.0.0.1, 169.254.169.254, 10.x, 192.168.x, ::1, ...) and DNS rebinding.
  await assertPublicUrl(`${origin}/`);
  return origin;
}

// GitLab Duo - Authorization Code Flow with PKCE
// Supports two login modes via loginMode metadata: "oauth" (default) or "pat"
const gitlab = {
  config: GITLAB_CONFIG,
  flowType: "authorization_code_pkce",
  buildAuthUrl: (config, redirectUri, state, codeChallenge, meta = {}) => {
    const baseUrl = assertGitlabBaseUrlSync(meta.baseUrl || config.defaultBaseUrl);
    const clientId = meta.clientId || "";
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      state,
      scope: config.scope,
      code_challenge: codeChallenge,
      code_challenge_method: config.codeChallengeMethod,
    });
    return `${baseUrl}${config.authorizeUrlPath}?${params.toString()}`;
  },
  exchangeToken: async (config, code, redirectUri, codeVerifier, state, meta = {}) => {
    const baseUrl = await assertValidGitlabBaseUrl(meta.baseUrl || config.defaultBaseUrl);
    const clientId = meta.clientId || "";
    const clientSecret = meta.clientSecret || "";
    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
    });
    if (clientSecret) body.set("client_secret", clientSecret);
    const response = await fetch(`${baseUrl}${config.tokenUrlPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });
    if (!response.ok) throw new Error(`GitLab token exchange failed: ${await response.text()}`);
    const tokens = await response.json();
    // Fetch user info
    const userRes = await fetch(`${baseUrl}${config.userInfoUrlPath}`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const user = userRes.ok ? await userRes.json() : {};
    return { ...tokens, _user: user, _baseUrl: baseUrl, _clientId: clientId };
  },
  mapTokens: (tokens) => ({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresIn: tokens.expires_in,
    scope: tokens.scope,
    providerSpecificData: {
      username: tokens._user?.username || "",
      email: tokens._user?.email || tokens._user?.public_email || "",
      name: tokens._user?.name || "",
      baseUrl: tokens._baseUrl,
      clientId: tokens._clientId,
      authKind: "oauth",
    },
  }),
};

export default gitlab;
