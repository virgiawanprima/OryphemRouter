import { safeOutboundFetch } from "../utils/omni/safeOutboundFetch.js";
import { registerDynamicImageModelSource } from "../utils/omni/dynamicImageModelSources.js";
const AI_HORDE_API_BASE = "https://aihorde.net/api";
const AI_HORDE_ANONYMOUS_KEY = "0000000000";
const AI_HORDE_CLIENT_AGENT = "OmniRoute:3.8.49:https://github.com/diegosouzapw/OmniRoute";
const AI_HORDE_CATALOG_POLL_MS = 3e4;
const AI_HORDE_CATALOG_FETCH_TIMEOUT_MS = 15e3;
const defaultHordeFetch = (input, init) => {
  const { timeoutMs, ...rest } = init || {};
  return safeOutboundFetch(input, {
    guard: "none",
    timeoutMs: timeoutMs ?? AI_HORDE_CATALOG_FETCH_TIMEOUT_MS,
    ...rest
  });
};
function asNumber(value) {
  if (value === null || value === void 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function asInt(value) {
  const parsed = asNumber(value);
  return parsed === null ? null : Math.trunc(parsed);
}
function parseHordeImageModels(payload) {
  if (!Array.isArray(payload)) {
    throw new Error("Horde model catalog must be a JSON array");
  }
  const models = [];
  for (const item of payload) {
    if (!item || typeof item !== "object") continue;
    const row = item;
    const name = row.name;
    if (typeof name !== "string" || !name.trim()) continue;
    const modelType = row.type ?? "image";
    if (modelType !== null && modelType !== "image") continue;
    const count = asInt(row.count ?? 0) ?? 0;
    if (count <= 0) continue;
    models.push({
      name,
      count,
      queued: asNumber(row.queued),
      eta: asInt(row.eta),
      performance: asNumber(row.performance),
      jobs: asNumber(row.jobs)
    });
  }
  models.sort((a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" }));
  return models;
}
class HordeImageCatalog {
  pollMs;
  models = /* @__PURE__ */ new Map();
  updatedAt = null;
  lastError = null;
  inflight = null;
  fetchImpl;
  constructor(options = {}) {
    this.pollMs = Math.max(5e3, options.pollMs ?? AI_HORDE_CATALOG_POLL_MS);
    this.fetchImpl = options.fetchImpl ?? defaultHordeFetch;
  }
  get snapshot() {
    return {
      models: this.listModels(),
      updatedAt: this.updatedAt,
      lastError: this.lastError
    };
  }
  get stale() {
    return this.lastError !== null && this.updatedAt !== null;
  }
  listModels() {
    return [...this.models.values()].sort(
      (a, b) => a.name.localeCompare(b.name, void 0, { sensitivity: "base" })
    );
  }
  get(name) {
    return this.models.get(name);
  }
  isServed(name) {
    const model = this.models.get(name);
    return Boolean(model && model.count > 0);
  }
  hasSnapshot() {
    return this.updatedAt !== null;
  }
  replace(models, error = null) {
    this.models = new Map(models.map((model) => [model.name, model]));
    if (error === null) {
      this.updatedAt = Date.now();
      this.lastError = null;
    } else {
      this.lastError = error;
    }
  }
  /** Drop the snapshot so the next `ensureFresh` must hit Horde. */
  clear() {
    this.models = /* @__PURE__ */ new Map();
    this.updatedAt = null;
    this.lastError = null;
  }
  setFetch(fetchImpl) {
    this.fetchImpl = fetchImpl;
  }
  async refresh(options = {}) {
    if (this.inflight) return this.inflight;
    this.inflight = this.refreshOnce(options).finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }
  async ensureFresh(maxAgeMs = this.pollMs, options = {}) {
    if (this.updatedAt !== null && Date.now() - this.updatedAt < maxAgeMs && !this.lastError) {
      return;
    }
    await this.refresh(options);
  }
  async refreshOnce(options = {}) {
    try {
      const url = `${AI_HORDE_API_BASE}/v2/status/models?type=image`;
      const response = await this.fetchImpl(url, {
        method: "GET",
        headers: { Accept: "application/json", "Client-Agent": AI_HORDE_CLIENT_AGENT },
        signal: options.signal,
        timeoutMs: options.timeoutMs
      });
      if (!response.ok) {
        throw new Error(`Horde catalog HTTP ${response.status}`);
      }
      const models = parseHordeImageModels(await response.json());
      this.replace(models);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.lastError = message;
    }
  }
}
const aiHordeImageCatalog = new HordeImageCatalog();
function resetAiHordeImageCatalog() {
  aiHordeImageCatalog.clear();
}
function getCachedAiHordeImageCatalogEntries() {
  return aiHordeImageCatalog.listModels().map((model) => ({
    id: `aihorde/${model.name}`,
    name: `${model.name} (AI Horde)`,
    provider: "aihorde",
    supportedSizes: ["512x512", "768x768", "1024x1024", "1024x768", "768x1024"],
    inputModalities: ["text", "image"],
    description: `${model.count} worker${model.count === 1 ? "" : "s"} online`
  }));
}
registerDynamicImageModelSource(
  "aihorde",
  () => getCachedAiHordeImageCatalogEntries().map((entry) => ({
    id: entry.id.startsWith("aihorde/") ? entry.id.slice("aihorde/".length) : entry.id,
    name: entry.name,
    inputModalities: entry.inputModalities
  }))
);
export {
  AI_HORDE_ANONYMOUS_KEY,
  AI_HORDE_API_BASE,
  AI_HORDE_CATALOG_FETCH_TIMEOUT_MS,
  AI_HORDE_CATALOG_POLL_MS,
  AI_HORDE_CLIENT_AGENT,
  HordeImageCatalog,
  aiHordeImageCatalog,
  getCachedAiHordeImageCatalogEntries,
  parseHordeImageModels,
  resetAiHordeImageCatalog
};
