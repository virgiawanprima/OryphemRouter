const DEFAULT_CONFIG = {
  windowSize: 200,
  ttlMs: 36e5
  // 1 hour
};
let usageWindow = [];
let config = { ...DEFAULT_CONFIG };
function configureDiversity(userConfig) {
  config = { ...DEFAULT_CONFIG, ...userConfig };
}
function recordProviderUsage(provider) {
  const now = Date.now();
  usageWindow.push({ provider, timestamp: now });
  if (usageWindow.length > config.windowSize) {
    usageWindow = usageWindow.slice(-config.windowSize);
  }
  const cutoff = now - config.ttlMs;
  usageWindow = usageWindow.filter((e) => e.timestamp >= cutoff);
}
function calculateDiversityScore() {
  if (usageWindow.length === 0) return 1;
  const now = Date.now();
  const cutoff = now - config.ttlMs;
  const recent = usageWindow.filter((e) => e.timestamp >= cutoff);
  if (recent.length === 0) return 1;
  const counts = /* @__PURE__ */ new Map();
  for (const entry of recent) {
    counts.set(entry.provider, (counts.get(entry.provider) || 0) + 1);
  }
  const total = recent.length;
  const nUnique = counts.size;
  if (nUnique <= 1) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / total;
    entropy -= p * Math.log2(p);
  }
  const maxEntropy = Math.log2(nUnique);
  return maxEntropy > 0 ? entropy / maxEntropy : 0;
}
function getProviderDiversityBoost(provider) {
  if (usageWindow.length === 0) return 0.5;
  const now = Date.now();
  const cutoff = now - config.ttlMs;
  const recent = usageWindow.filter((e) => e.timestamp >= cutoff);
  if (recent.length === 0) return 0.5;
  const total = recent.length;
  const providerCount = recent.filter((e) => e.provider === provider).length;
  const usageShare = providerCount / total;
  return Math.max(0, 1 - usageShare);
}
function getDiversityReport() {
  const now = Date.now();
  const cutoff = now - config.ttlMs;
  const recent = usageWindow.filter((e) => e.timestamp >= cutoff);
  const counts = /* @__PURE__ */ new Map();
  for (const entry of recent) {
    counts.set(entry.provider, (counts.get(entry.provider) || 0) + 1);
  }
  const providers = {};
  for (const [provider, count] of counts) {
    providers[provider] = {
      count,
      share: recent.length > 0 ? count / recent.length : 0
    };
  }
  return {
    score: calculateDiversityScore(),
    totalRequests: recent.length,
    providers,
    windowSize: config.windowSize,
    ttlMs: config.ttlMs
  };
}
function resetDiversity() {
  usageWindow = [];
  config = { ...DEFAULT_CONFIG };
}
export {
  calculateDiversityScore,
  configureDiversity,
  getDiversityReport,
  getProviderDiversityBoost,
  recordProviderUsage,
  resetDiversity
};
