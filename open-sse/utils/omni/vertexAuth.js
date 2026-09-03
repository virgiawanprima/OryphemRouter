/**
 * ADAPTED — Vertex AI auth helpers for vertexMedia.js, ported from OmniRoute
 * open-sse/executors/vertex.ts (the chat executor's auth surface). OryphemRouter's
 * vertex.js does not export these, so they live here.
 */
import { SignJWT, importPKCS8 } from "jose";

const TOKEN_CACHE = new Map();

export const VERTEX_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/generative-language.retriever",
];

export function parseSAFromApiKey(apiKey) {
  try {
    return JSON.parse(apiKey);
  } catch {
    throw new Error("Vertex AI requires a valid Service Account JSON as the API key");
  }
}

export function looksLikeServiceAccountJson(apiKey) {
  if (!apiKey || typeof apiKey !== "string") return false;
  try {
    const parsed = JSON.parse(apiKey);
    return !!parsed && typeof parsed === "object" && !Array.isArray(parsed);
  } catch {
    return false;
  }
}

export function isExpressApiKey(apiKey) {
  return typeof apiKey === "string" && apiKey.trim().length > 0 && !looksLikeServiceAccountJson(apiKey);
}

export async function getAccessToken(sa) {
  if (!sa.client_email || !sa.private_key) {
    throw new Error("Service Account JSON is missing required fields (client_email or private_key)");
  }
  const cacheKey = sa.client_email;
  const cached = TOKEN_CACHE.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt - 60_000) {
    return cached.token;
  }
  const privateKey = await importPKCS8(sa.private_key, "RS256");
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: sa.client_email,
    sub: sa.client_email,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
    scope: VERTEX_OAUTH_SCOPES.join(" "),
  })
    .setProtectedHeader({ alg: "RS256", kid: sa.private_key_id })
    .sign(privateKey);

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Failed to exchange JWT for Vertex access token: ${tokenRes.status} ${errorText}`);
  }
  const tokenData = await tokenRes.json();
  const accessToken = tokenData.access_token;
  if (!accessToken) {
    throw new Error("Vertex AI token exchange succeeded but no access_token found");
  }
  TOKEN_CACHE.set(cacheKey, { token: accessToken, expiresAt: Date.now() + 3600 * 1000 });
  return accessToken;
}
