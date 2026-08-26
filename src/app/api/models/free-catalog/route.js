import { NextResponse } from "next/server";

/**
 * Free/no-auth provider live catalog.
 *
 * The dashboard (Basic Chat, model selectors) needs to show models for free
 * no-auth providers (opencode, …) even though the user has configured no API
 * key. Fetching these catalogs directly from the browser is blocked by CORS,
 * and /api/v1/models requires an API key — so we proxy the public catalog
 * server-side. Only publicly-available model IDs are returned (no secrets).
 *
 * Response: { [providerId]: [{ id, name }] }
 */

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min — catalog is slow-moving
const cache = new Map(); // providerId -> { at, value }

const PUBLIC_CATALOGS = {
  opencode: "https://opencode.ai/zen/v1/models",
};

async function fetchCatalog(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.data || [];
  return list
    .filter((m) => m && typeof m.id === "string" && m.id)
    .map((m) => ({ id: m.id, name: m.name || m.id }));
}

export async function GET() {
  const out = {};

  await Promise.all(
    Object.entries(PUBLIC_CATALOGS).map(async ([providerId, url]) => {
      const cached = cache.get(providerId);
      if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
        out[providerId] = cached.value;
        return;
      }
      try {
        const models = await fetchCatalog(url);
        cache.set(providerId, { at: Date.now(), value: models });
        out[providerId] = models;
      } catch {
        out[providerId] = [];
      }
    })
  );

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}
