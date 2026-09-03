import { logToolCall } from "./audit.js";
import { radarCatalogInput, radarCatalogOutput } from "./schemas/radarCatalog.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function text(value, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function number(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}
function nullableNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}
function normalizeMeta(value) {
  const meta = record(value);
  if (typeof meta.version !== "string" || typeof meta.tier !== "string" || typeof meta.fetchedAt !== "string") {
    return null;
  }
  return { version: meta.version, tier: meta.tier, fetchedAt: meta.fetchedAt };
}
function normalizeEntry(value) {
  const entry = record(value);
  const provider = text(entry.provider).trim();
  const modelId = text(entry.modelId).trim();
  if (!provider || !modelId) return null;
  const capabilities = record(entry.capabilities);
  const limits = record(entry.limits);
  const origin = entry.origin === "radar" || entry.origin === "local" ? entry.origin : "baseline";
  return {
    provider,
    modelId,
    displayName: text(entry.displayName, modelId),
    familyId: typeof entry.familyId === "string" ? entry.familyId : null,
    quota: {
      monthlyTokens: number(entry.monthlyTokens),
      creditTokens: number(entry.creditTokens),
      freeType: text(entry.freeType, "unknown"),
      limits: Object.keys(limits).length > 0 ? {
        rpm: nullableNumber(limits.rpm),
        rpd: nullableNumber(limits.rpd),
        tpm: nullableNumber(limits.tpm),
        tpd: nullableNumber(limits.tpd)
      } : null
    },
    capabilities: Object.keys(capabilities).length > 0 ? {
      tools: capabilities.tools === true,
      vision: capabilities.vision === true,
      thinking: capabilities.thinking === true
    } : null,
    enabled: entry.enabled !== false,
    origin,
    disabledBy: entry.disabledBy === "radar" ? "radar" : null
  };
}
function compareEntries(left, right) {
  return left.provider.localeCompare(right.provider) || left.modelId.localeCompare(right.modelId);
}
async function getMcpRadarCatalog(args, deps = {}) {
  const fetchJson = deps.fetchJson ?? ((path) => import("./server.js").then((module) => module.omniRouteFetch(path)));
  const raw = record(await fetchJson("/api/radar/catalog"));
  const providerFilter = args.provider?.trim().toLowerCase();
  const familyFilter = args.familyId?.trim().toLowerCase();
  const enabledOnly = args.enabledOnly !== false;
  const entries = Array.isArray(raw.entries) ? raw.entries : [];
  const models = entries.map(normalizeEntry).filter((entry) => entry !== null).filter((entry) => !enabledOnly || entry.enabled).filter((entry) => !providerFilter || entry.provider.toLowerCase() === providerFilter).filter((entry) => !familyFilter || entry.familyId?.toLowerCase() === familyFilter).sort(compareEntries);
  return { meta: normalizeMeta(raw.meta), models };
}
async function handleRadarCatalog(args) {
  const start = Date.now();
  try {
    const result = radarCatalogOutput.parse(await getMcpRadarCatalog(args));
    await logToolCall(
      "omniroute_radar_catalog",
      args,
      { modelCount: result.models.length },
      Date.now() - start,
      true
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    const message = sanitizeErrorMessage(error) || "Failed to read Radar catalog";
    await logToolCall("omniroute_radar_catalog", args, null, Date.now() - start, false, message);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
}
function registerRadarCatalogTool(server, withScopeEnforcement) {
  server.registerTool(
    "omniroute_radar_catalog",
    {
      description: "Reads the local signed Radar catalog with optional provider and family filters",
      inputSchema: radarCatalogInput
    },
    withScopeEnforcement(
      "omniroute_radar_catalog",
      (args) => handleRadarCatalog(radarCatalogInput.parse(args))
    )
  );
}
export {
  getMcpRadarCatalog,
  registerRadarCatalogTool
};
