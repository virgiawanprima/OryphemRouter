import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const ALIBABA_FREE_TIER_TEXT_CAPABLE_MODELS = [
  "deepseek-v3.2",
  "deepseek-v4-pro",
  "glm-5.2",
  "qwen-flash",
  "qwen-flash-2025-07-28",
  "qwen-flash-character",
  "qwen-max",
  "qwen-mt-flash",
  "qwen-mt-lite",
  "qwen-mt-plus",
  "qwen-mt-turbo",
  "qwen-plus-2025-04-28",
  "qwen-plus-2025-07-14",
  "qwen-plus-2025-07-28",
  "qwen-plus-2025-09-11",
  "qwen-plus-character",
  "qwen-plus-latest",
  "qwen3-14b",
  "qwen3-235b-a22b",
  "qwen3-235b-a22b-instruct-2507",
  "qwen3-235b-a22b-thinking-2507",
  "qwen3-30b-a3b",
  "qwen3-30b-a3b-instruct-2507",
  "qwen3-30b-a3b-thinking-2507",
  "qwen3-32b",
  "qwen3-8b",
  "qwen3-coder-30b-a3b-instruct",
  "qwen3-coder-480b-a35b-instruct",
  "qwen3-coder-flash",
  "qwen3-coder-flash-2025-07-28",
  "qwen3-coder-next",
  "qwen3-coder-plus",
  "qwen3-coder-plus-2025-07-22",
  "qwen3-coder-plus-2025-09-23",
  "qwen3-max",
  "qwen3-max-2025-09-23",
  "qwen3-max-2026-01-23",
  "qwen3-max-preview",
  "qwen3-next-80b-a3b-instruct",
  "qwen3-next-80b-a3b-thinking",
  "qwen3.5-122b-a10b",
  "qwen3.5-27b",
  "qwen3.5-397b-a17b",
  "qwen3.5-flash",
  "qwen3.5-flash-2026-02-23",
  "qwen3.5-plus",
  "qwen3.5-plus-2026-02-15",
  "qwen3.5-plus-2026-04-20",
  "qwen3.6-27b",
  "qwen3.6-35b-a3b",
  "qwen3.6-flash",
  "qwen3.6-flash-2026-04-16",
  "qwen3.6-max-preview",
  "qwen3.6-plus",
  "qwen3.6-plus-2026-04-02",
  "qwen3.7-flash",
  "qwen3.7-flash-2026-07-15",
  "qwen3.7-max-2026-05-17",
  "qwen3.7-max-2026-05-20",
  "qwen3.7-max-2026-06-08",
  "qwen3.7-max-preview",
  "qwen3.7-plus-2026-05-26",
  "qwq-plus"
];
const ALIBABA_NO_FREE_TIER_TEXT_MODELS = [
  "deepseek-v4-flash",
  "glm-5.1",
  "glm-5.2-fast-preview",
  "kimi-k2.7-code",
  "qwen-plus",
  "qwen-plus-2025-01-25",
  "qwen-plus-character-ja",
  "qwen-turbo",
  "qwen3.5-35b-a3b",
  "qwen3.7-max",
  "qwen3.7-plus"
];
const EMBEDDED_ALLOWLIST_PACK = {
  asOf: "2026-07-25",
  capable: [...ALIBABA_FREE_TIER_TEXT_CAPABLE_MODELS],
  noFreeTier: [...ALIBABA_NO_FREE_TIER_TEXT_MODELS]
};
let cachedPack;
function resetAlibabaFreeTierAllowlistCache() {
  cachedPack = void 0;
}
function resolveAllowlistPaths() {
  const paths = [];
  const envPath = process.env.ALIBABA_FREE_TIER_ALLOWLIST_PATH?.trim();
  if (envPath) paths.push(envPath);
  const dataDir = process.env.DATA_DIR?.trim() || path.join(os.homedir(), ".omniroute");
  paths.push(path.join(dataDir, "alibaba-free-tier-allowlist.json"));
  paths.push(path.join(process.cwd(), "config", "alibaba-free-tier-allowlist.json"));
  return paths;
}
function parseAllowlistPack(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const record = raw;
  const capable = Array.isArray(record.capable) ? record.capable.filter(
    (entry) => typeof entry === "string" && entry.length > 0
  ) : [];
  const noFreeTier = Array.isArray(record.noFreeTier) ? record.noFreeTier.filter(
    (entry) => typeof entry === "string" && entry.length > 0
  ) : [];
  const asOf = typeof record.asOf === "string" && record.asOf.trim() ? record.asOf.trim() : null;
  if (!asOf || capable.length === 0) return null;
  return {
    asOf,
    validUntil: typeof record.validUntil === "string" && record.validUntil.trim() ? record.validUntil.trim() : void 0,
    capable,
    noFreeTier
  };
}
function isAlibabaFreeTierAllowlistPackValid(pack, nowMs = Date.now()) {
  if (!pack.validUntil) return true;
  const expiresAt = Date.parse(pack.validUntil);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt >= nowMs;
}
function loadAlibabaFreeTierAllowlistPack() {
  if (cachedPack !== void 0) return cachedPack;
  for (const candidatePath of resolveAllowlistPaths()) {
    try {
      if (!fs.existsSync(candidatePath)) continue;
      const parsed = parseAllowlistPack(JSON.parse(fs.readFileSync(candidatePath, "utf8")));
      if (parsed && isAlibabaFreeTierAllowlistPackValid(parsed)) {
        cachedPack = parsed;
        return cachedPack;
      }
    } catch {
    }
  }
  cachedPack = null;
  return cachedPack;
}
function resolveActiveAllowlistPack() {
  return loadAlibabaFreeTierAllowlistPack() ?? EMBEDDED_ALLOWLIST_PACK;
}
function getAlibabaBuiltinFreeTierTextCapableModels() {
  return resolveActiveAllowlistPack().capable;
}
function getAlibabaBuiltinNoFreeTierTextModels() {
  return resolveActiveAllowlistPack().noFreeTier;
}
function isAlibabaBuiltinFreeTierTextModel(modelId) {
  return getAlibabaBuiltinFreeTierTextCapableModels().includes(modelId);
}
function isAlibabaBuiltinNoFreeTierTextModel(modelId) {
  return getAlibabaBuiltinNoFreeTierTextModels().includes(modelId);
}
export {
  ALIBABA_FREE_TIER_TEXT_CAPABLE_MODELS,
  ALIBABA_NO_FREE_TIER_TEXT_MODELS,
  getAlibabaBuiltinFreeTierTextCapableModels,
  getAlibabaBuiltinNoFreeTierTextModels,
  isAlibabaBuiltinFreeTierTextModel,
  isAlibabaBuiltinNoFreeTierTextModel,
  isAlibabaFreeTierAllowlistPackValid,
  loadAlibabaFreeTierAllowlistPack,
  resetAlibabaFreeTierAllowlistCache
};
