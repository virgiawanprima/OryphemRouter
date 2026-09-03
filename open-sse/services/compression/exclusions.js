const MAX_EXCLUSIONS = 200;
function escapeExceptWildcard(pattern) {
  return pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
}
function compilePattern(pattern) {
  return new RegExp(`^${escapeExceptWildcard(pattern)}$`);
}
function normalizeCompressionExclusions(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim().toLowerCase();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= MAX_EXCLUSIONS) break;
  }
  return result;
}
function isCompressionExcluded(target, exclusions) {
  if (!exclusions || exclusions.length === 0) return false;
  const model = (target.model ?? "").trim().toLowerCase();
  const provider = (target.provider ?? "").trim().toLowerCase();
  if (!model && !provider) return false;
  const composite = provider && model ? `${provider}/${model}` : "";
  for (const pattern of exclusions) {
    if (!pattern) continue;
    const regex = compilePattern(pattern);
    if (model && regex.test(model)) return true;
    if (composite && regex.test(composite)) return true;
  }
  return false;
}
export {
  isCompressionExcluded,
  normalizeCompressionExclusions
};
