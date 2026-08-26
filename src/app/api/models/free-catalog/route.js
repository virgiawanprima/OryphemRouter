import { NextResponse } from "next/server";

/**
 * Free/no-auth provider live catalog — FILTERED to usable models.
 *
 * The dashboard (Basic Chat, model selectors) needs to show models for free
 * no-auth providers (opencode, …) even when no API key is configured. But the
 * public catalog includes BOTH free models AND paid models (claude-*, gpt-*,
 * …) which return 401 "Missing API key" without a key.
 *
 * This endpoint proxies the public catalog server-side, then performs a tiny
 * handshake (1-token chat) per model so ONLY models that actually work without
 * a key are returned. Paid models are excluded. Results are cached (15 min).
 *
 * Response: { [providerId]: [{ id, name }] }
 */

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 min — catalog is slow-moving
const cache = new Map(); // providerId -> { at, value }

const PUBLIC_CATALOGS = {
  opencode: "https://opencode.ai/zen/v1/models",
};

const HANDSHAKE_URL = "https://opencode.ai/zen/v1/chat/completions";

async function fetchCatalog(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const list = Array.isArray(data) ? data : data?.data || [];
  return list
    .filter((m) => m && typeof m.id === "string" && m.id)
    .map((m) => ({ id: m.id, name: m.name || m.id }));
}

/**
 * Tiny handshake: ask the model for a 1-token reply.
 *
 * - 2xx → usable without an API key (include).
 * - 401/403 → requires a key → EXCLUDE (never works keyless).
 * - other 4xx/5xx → transient upstream failure. For models that are explicitly
 *   FREE (id contains "-free"), keep them anyway — they are legitimately free,
 *   just temporarily unavailable (e.g. opencode deepseek-v4-flash-free returning
 *   "Model is unavailable"). Paid models with a transient error are excluded.
 */
async function isModelUsable(modelId, isFreeModel) {
  const attempt = async () => {
    const res = await fetch(HANDSHAKE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer public",
        "User-Agent": "opencode",
      },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 1,
        stream: false,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 401 || res.status === 403) return { usable: false, requiresKey: true };
    if (res.ok) return { usable: true };
    // transient failure — a free model stays visible, a paid one is dropped
    return { usable: isFreeModel, requiresKey: false };
  };

  try {
    const r = await attempt();
    if (r.usable || r.requiresKey) return r.usable;
  } catch {
    /* retry once below */
  }
  try {
    return (await attempt()).usable;
  } catch {
    return false;
  }
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
      const all = await fetchCatalog(url);
      // Handshake in parallel; keep only models that work without a key. Models
      // explicitly marked free (id contains "-free") stay visible even if the
      // handshake currently fails transiently.
      const usable = [];
      const CHUNK = 8;
      for (let i = 0; i < all.length; i += CHUNK) {
        const chunk = all.slice(i, i + CHUNK);
        const results = await Promise.all(chunk.map((m) => isModelUsable(m.id, /-free$/i.test(m.id))));
        chunk.forEach((m, idx) => {
          if (results[idx]) usable.push(m);
        });
      }
      cache.set(providerId, { at: Date.now(), value: usable });
      out[providerId] = usable;
    })
  );

  return NextResponse.json(out, {
    headers: { "Cache-Control": "no-store" },
  });
}
