import { normalizeLine } from "./grouper.js";
function discoverNormalizeLine(line) {
  let s = normalizeLine(line);
  s = s.replace(/[\w][\w.-]{0,128}@(?:<N>|\d[\w.-]{0,64})/g, "<PKG>@<N>");
  s = s.replace(/\bE[A-Z0-9]{2,}\b/g, "<CODE>");
  s = s.replace(/\b\d+(?:\.\d+)?(?:ms|[smhd]|[kmg]b?)\b/gi, "<N>");
  s = s.replace(/<N>(?:ms|[smhd]|[kmg]b?)\b/gi, "<N>");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
function normalizedToPattern(normalised) {
  const escaped = normalised.replace(/[$()*+.?[\\\]^{|}]/g, "\\$&");
  const withWildcards = escaped.replace(/<N>/g, "[\\S]+").replace(/<PKG>/g, "[\\S]+").replace(/<CODE>/g, "[A-Z][A-Z0-9]+");
  return `^${withWildcards}`;
}
function discoverRepeatedNoise(samples) {
  if (samples.length === 0) return [];
  const hitsBySample = /* @__PURE__ */ new Map();
  for (let i = 0; i < samples.length; i++) {
    const lines = samples[i].output.split(/\r?\n/);
    const seenInThisSample = /* @__PURE__ */ new Set();
    for (const raw of lines) {
      const trimmed = raw.trim();
      if (trimmed.length === 0) continue;
      const norm = discoverNormalizeLine(trimmed);
      if (norm.length === 0) continue;
      if (seenInThisSample.has(norm)) continue;
      seenInThisSample.add(norm);
      if (!hitsBySample.has(norm)) {
        hitsBySample.set(norm, /* @__PURE__ */ new Set());
      }
      hitsBySample.get(norm).add(i);
    }
  }
  const candidates = [];
  for (const [norm, sampleSet] of hitsBySample) {
    if (sampleSet.size <= 1) continue;
    candidates.push({
      pattern: normalizedToPattern(norm),
      hits: sampleSet.size
    });
  }
  candidates.sort((a, b) => b.hits - a.hits || a.pattern.localeCompare(b.pattern));
  return candidates;
}
export {
  discoverNormalizeLine,
  discoverRepeatedNoise
};
