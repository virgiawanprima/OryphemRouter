import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";
import { getSettings } from "@/lib/localDb";

const DEFAULT_PASSWORD = "123";

// Secrets that are publicly known (shipped in .env.example / documented) must
// never be accepted as the live signing key — anyone can forge JWTs with them.
const WEAK_JWT_SECRETS = new Set([
  "change-me-to-a-long-random-secret",
  "change-me",
  "secret",
  "changeme",
  "your-secret-key",
]);

function loadJwtSecret() {
  if (process.env.JWT_SECRET) {
    const s = String(process.env.JWT_SECRET);
    if (WEAK_JWT_SECRETS.has(s) || s.length < 32) {
      // Refuse to boot with a forgeable key. Log clearly and throw so a
      // misconfigured deployment fails loudly instead of shipping an auth bypass.
      console.error(
        "[Auth] JWT_SECRET is missing, a known placeholder, or shorter than 32 chars. " +
        "Set a strong random secret (e.g. `openssl rand -hex 32`). Refusing to start."
      );
      throw new Error("Refusing to start: JWT_SECRET is weak or unset (use a strong random secret >= 32 chars).");
    }
    return s;
  }
  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {}
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

const SECRET = new TextEncoder().encode(loadJwtSecret());

export function shouldUseSecureCookie(request) {
  // OryphemRouter runs on localhost without a reverse proxy by default.
  // Secure cookies are dropped by browsers over plain HTTP, so only
  // enable when behind HTTPS (forwarded-proto) or explicitly forced.
  const forceSecureCookie = process.env.AUTH_COOKIE_SECURE === "true";
  const forwardedProto = request?.headers?.get?.("x-forwarded-proto");
  const isHttpsRequest = forwardedProto === "https";
  // AUTH_COOKIE_SECURE=true forces Secure even without x-forwarded-proto
  // (e.g. ssh -L / raw TLS LB that does not stamp forwarded headers).
  return forceSecureCookie || isHttpsRequest;
}

export async function createDashboardAuthToken(claims = {}) {
  // Bind the token to the current password generation so that changing/resetting
  // the dashboard password invalidates every previously-issued session.
  const settings = await getSettings();
  const pwv = settings.passwordVersion ?? 0;
  return new SignJWT({ authenticated: true, ...claims, pwv })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET);
}

export async function verifyDashboardAuthToken(token) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    // Only tokens explicitly minted as authenticated sessions count — a token
    // signed with the same key but missing `authenticated: true` is not a session.
    if (payload.authenticated !== true) return false;
    const settings = await getSettings();
    return (payload.pwv ?? 0) === (settings.passwordVersion ?? 0);
  } catch {
    return false;
  }
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.authenticated !== true) return null;
    const settings = await getSettings();
    if ((payload.pwv ?? 0) !== (settings.passwordVersion ?? 0)) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(cookieStore, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days — persists across browser restarts
  });
}

export function clearDashboardAuthCookie(cookieStore) {
  cookieStore.delete("auth_token");
}

// Verify the current dashboard password (re-auth for sensitive actions).
export async function verifyDashboardPassword(password) {
  if (typeof password !== "string" || !password) return false;
  const settings = await getSettings();
  const storedHash = settings?.password;
  if (storedHash) return bcrypt.compare(password, storedHash);
  const initialPassword = process.env.INITIAL_PASSWORD || DEFAULT_PASSWORD;
  return password === initialPassword;
}
