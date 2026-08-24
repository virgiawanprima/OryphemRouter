import { parseJson } from "@/lib/utils/parseJson";
import { NextResponse } from "next/server";
import { createProviderConnection } from "@/models";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard";

const GITLAB_DEFAULT_BASE = "https://gitlab.com";

// Resolve and validate the GitLab base URL before any server-side fetch:
// must be https and must not target loopback/private/internal hosts (SSRF).
async function resolveGitLabBase(rawBaseUrl) {
  const candidate = (rawBaseUrl?.trim() || GITLAB_DEFAULT_BASE).replace(/\/$/, "");
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:") {
    throw new Error("baseUrl must use https");
  }
  await assertPublicUrl(parsed.toString());
  return parsed.origin;
}

/**
 * POST /api/oauth/gitlab/pat
 * Authenticate GitLab Duo with a Personal Access Token (PAT)
 */
export async function POST(request) {
  try {
    let body;
    try {
      body = await parseJson(request);
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const { token, baseUrl } = body;
    if (!token?.trim()) {
      return NextResponse.json({ error: "Personal Access Token is required" }, { status: 400 });
    }

    let base;
    try {
      base = await resolveGitLabBase(baseUrl);
    } catch {
      return NextResponse.json({ error: "Invalid GitLab base URL" }, { status: 400 });
    }

    // Verify token by fetching current user
    const userRes = await fetch(`${base}/api/v4/user`, {
      headers: { "Private-Token": token.trim(), Accept: "application/json" },
    });

    if (!userRes.ok) {
      // Don't reflect upstream response text — it can leak internal details.
      return NextResponse.json({ error: "GitLab token verification failed" }, { status: 401 });
    }

    const user = await userRes.json();
    const email = user.email || user.public_email || "";

    await createProviderConnection({
      provider: "gitlab",
      authType: "oauth",
      accessToken: token.trim(),
      refreshToken: null,
      expiresAt: null,
      email,
      displayName: user.name || user.username || email,
      testStatus: "active",
      providerSpecificData: {
        username: user.username || "",
        email,
        name: user.name || "",
        baseUrl: base,
        authKind: "personal_access_token",
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("GitLab PAT auth error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
