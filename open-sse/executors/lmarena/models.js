const LMARENA_API_BASE = "https://arena.ai";
const LMARENA_STREAM_URL = `${LMARENA_API_BASE}/nextjs-api/stream/create-evaluation`;
const LMARENA_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const LMARENA_MODEL_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function buildLmarenaBrowserHeaders(extra) {
  return {
    Accept: "text/event-stream, application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Origin: LMARENA_API_BASE,
    Referer: `${LMARENA_API_BASE}/`,
    "Sec-Ch-Ua": '"Chromium";v="150", "Google Chrome";v="150", "Not-A.Brand";v="24"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "User-Agent": LMARENA_USER_AGENT,
    ...extra
  };
}
function stripLMArenaModelPrefix(model) {
  return model.replace(/^(?:lmarena|lma|arena)\//i, "").trim();
}
function normalizeModelName(model) {
  return model.trim().toLowerCase();
}
function hasLMArenaCapability(entry, direction, key) {
  const capabilities = direction === "input" ? entry.capabilities?.inputCapabilities : entry.capabilities?.outputCapabilities;
  return capabilities?.[key] === true;
}
const LMARENA_MAX_REASONABLE_CHAT_RANK = 1e5;
const LMARENA_CATALOG_SOFT_CAP = 120;
const deadCatalogKeys = /* @__PURE__ */ new Map();
const DEAD_CATALOG_TTL_MS = 6 * 60 * 60 * 1e3;
function deadKey(value) {
  return value.trim().toLowerCase();
}
function markLMArenaCatalogModelDead(idOrPublicName) {
  if (!idOrPublicName?.trim()) return;
  deadCatalogKeys.set(deadKey(idOrPublicName), Date.now() + DEAD_CATALOG_TTL_MS);
}
function clearLMArenaDeadCatalogModels() {
  deadCatalogKeys.clear();
}
function isMarkedDead(entry, publicId) {
  const now = Date.now();
  for (const key of [publicId, entry.id, entry.publicName, entry.name, entry.displayName]) {
    if (!key) continue;
    const exp = deadCatalogKeys.get(deadKey(key));
    if (exp === void 0) continue;
    if (exp <= now) {
      deadCatalogKeys.delete(deadKey(key));
      continue;
    }
    return true;
  }
  return false;
}
function isLMArenaChatCatalogModel(entry) {
  if (entry.userSelectable === false) return false;
  if (typeof entry.id !== "string" || !LMARENA_MODEL_ID_RE.test(entry.id)) return false;
  const chatRank = entry.rankByModality?.chat;
  if (typeof chatRank !== "number" || !Number.isFinite(chatRank)) return false;
  if (chatRank >= LMARENA_MAX_REASONABLE_CHAT_RANK) return false;
  if (!hasLMArenaCapability(entry, "input", "text")) return false;
  if (!hasLMArenaCapability(entry, "output", "text")) return false;
  const publicId = getLMArenaPublicModelId(entry).trim();
  if (!publicId) return false;
  if (LMARENA_MODEL_ID_RE.test(publicId) && !entry.publicName && !entry.name) return false;
  return true;
}
function lmarenaModelResolutionScore(entry) {
  let score = 0;
  if (entry.userSelectable === false) score += 1e6;
  if (!hasLMArenaCapability(entry, "input", "text")) score += 1e5;
  if (!hasLMArenaCapability(entry, "output", "text")) score += 5e4;
  const chatRank = entry.rankByModality?.chat;
  if (typeof chatRank === "number" && Number.isFinite(chatRank)) {
    score += chatRank;
  } else if (typeof entry.rank === "number" && Number.isFinite(entry.rank)) {
    score += 1e4 + entry.rank;
  } else {
    score += 2e4;
  }
  if (!entry.name) score += 500;
  if (!entry.organization && !entry.provider) score += 100;
  return score;
}
function getLMArenaPublicModelId(entry) {
  return entry.publicName || entry.displayName || entry.name || entry.id || "";
}
function normalizeLMArenaModelsForCatalog(models) {
  const bestByPublicId = /* @__PURE__ */ new Map();
  models.forEach((entry, index) => {
    if (!isLMArenaChatCatalogModel(entry)) return;
    const publicId = getLMArenaPublicModelId(entry).trim();
    if (!publicId) return;
    if (isMarkedDead(entry, publicId)) return;
    const previous = bestByPublicId.get(publicId);
    if (!previous || lmarenaModelResolutionScore(entry) < lmarenaModelResolutionScore(previous.entry)) {
      bestByPublicId.set(publicId, { entry, index });
    }
  });
  return Array.from(bestByPublicId.entries()).sort(
    ([, a], [, b]) => lmarenaModelResolutionScore(a.entry) - lmarenaModelResolutionScore(b.entry) || a.index - b.index
  ).slice(0, LMARENA_CATALOG_SOFT_CAP).map(([id, { entry }]) => ({
    id,
    name: entry.displayName || entry.publicName || entry.name || id,
    owned_by: entry.organization || entry.provider || "lmarena",
    ...hasLMArenaCapability(entry, "input", "image") ? { supportsVision: true } : {},
    apiFormat: "chat-completions",
    supportedEndpoints: ["chat"]
  }));
}
function pickLMArenaModelId(model, models) {
  const requested = stripLMArenaModelPrefix(model);
  if (LMARENA_MODEL_ID_RE.test(requested)) return requested;
  const normalized = normalizeModelName(requested);
  const matches = models.map((entry, index) => ({ entry, index })).filter(({ entry }) => isLMArenaChatCatalogModel(entry)).filter(
    ({ entry }) => [entry.id, entry.publicName, entry.name, entry.displayName].some(
      (candidate) => typeof candidate === "string" && normalizeModelName(candidate) === normalized
    )
  );
  const match = matches.sort(
    (a, b) => lmarenaModelResolutionScore(a.entry) - lmarenaModelResolutionScore(b.entry) || a.index - b.index
  )[0]?.entry;
  return match?.id || requested;
}
function parseLMArenaInitialModels(html) {
  const escapedMarker = '\\"initialModels\\":[';
  const plainMarker = '"initialModels":[';
  const marker = html.includes(escapedMarker) ? escapedMarker : plainMarker;
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return [];
  const arrayStart = markerIndex + marker.length - 1;
  const escapedEnd = '],\\"initialModelAId\\"';
  const plainEnd = '],"initialModelAId"';
  const arrayEnd = html.indexOf(escapedEnd, arrayStart);
  const fallbackEnd = html.indexOf(plainEnd, arrayStart);
  const endIndex = arrayEnd >= 0 ? arrayEnd : fallbackEnd;
  if (endIndex < 0 || endIndex < arrayStart) return [];
  const rawArray = html.slice(arrayStart, endIndex + 1).replace(/\\"/g, '"');
  try {
    const parsed = JSON.parse(rawArray);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
async function getLMArenaModels(log) {
  const { LMARENA_DIRECT_MODEL_ENTRIES } = await import("../../providers/registry/lmarena/directModels.js");
  const models = LMARENA_DIRECT_MODEL_ENTRIES.filter(
    (m) => m.category === "Text" || m.category === "Search"
  ).map((m) => ({
    id: m.arenaId,
    publicName: m.catalogId,
    name: m.publicName,
    displayName: m.displayName,
    organization: m.organization,
    userSelectable: true,
    capabilities: {
      inputCapabilities: { text: true, ...m.vision ? { image: true } : {} },
      outputCapabilities: {
        text: true,
        ...m.category === "Search" ? { web: true } : {}
      }
    },
    rankByModality: { chat: 1 }
  }));
  log?.debug?.(
    "LMArenaExecutor",
    `Using static Direct-chat catalog (${models.length} Text/Search models; Image in imageRegistry)`
  );
  return models;
}
async function resolveLMArenaModelId(model, log) {
  const requested = stripLMArenaModelPrefix(model);
  if (LMARENA_MODEL_ID_RE.test(requested)) return requested;
  try {
    const { resolveLmarenaArenaId } = await import("../../providers/registry/lmarena/directModels.js");
    const fromSeed = resolveLmarenaArenaId(requested);
    if (fromSeed) return fromSeed;
    return pickLMArenaModelId(requested, await getLMArenaModels(log));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log?.warn?.(
      "LMArenaExecutor",
      `Using raw model id after static catalog lookup failed: ${message}`
    );
    return requested;
  }
}
export {
  LMARENA_API_BASE,
  LMARENA_CATALOG_SOFT_CAP,
  LMARENA_MODEL_ID_RE,
  LMARENA_STREAM_URL,
  LMARENA_USER_AGENT,
  buildLmarenaBrowserHeaders,
  clearLMArenaDeadCatalogModels,
  getLMArenaModels,
  markLMArenaCatalogModelDead,
  normalizeLMArenaModelsForCatalog,
  parseLMArenaInitialModels,
  pickLMArenaModelId,
  resolveLMArenaModelId
};
