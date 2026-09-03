import { NextResponse } from "next/server";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/**
 * GET /api/media-providers/registry
 * Returns the union of providers from the ported media registries
 * (upscale / music / ocr / rerank / moderation) so the dashboard can list them.
 *
 * Response:
 *   { providers: { upscale: [...], music: [...], ocr: [...], rerank: [...], moderation: [...] } }
 * Each item has at least { id, name, category } (plus `kind`, `models`, `modelCount`, ...).
 *
 * The bridge is loaded via dynamic import inside try/catch so a missing or
 * misconfigured registry can never 500 the route — it degrades to an empty
 * `{ providers: {} }` payload instead.
 */
export async function GET() {
  try {
    let bridge;
    try {
      bridge = await import("open-sse/handlers/mediaRegistryBridge.js");
    } catch {
      bridge = null;
    }

    const providers =
      bridge && typeof bridge.getAllRegistryProviders === "function"
        ? bridge.getAllRegistryProviders()
        : {};

    return NextResponse.json({ providers }, { headers: CORS_HEADERS });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || "Failed to load media registry", providers: {} },
      { status: 502, headers: CORS_HEADERS }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}
