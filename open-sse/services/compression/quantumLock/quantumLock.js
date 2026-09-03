import {
  QUANTUM_PATTERNS
} from "./quantumPatterns.js";
function detectVolatileSpans(text, cfg) {
  if (!text) return [];
  const allow = cfg.categories && cfg.categories.length > 0 ? new Set(cfg.categories) : null;
  const raw = [];
  try {
    QUANTUM_PATTERNS.forEach(({ category, pattern }, prio) => {
      if (allow && !allow.has(category)) return;
      pattern.lastIndex = 0;
      let m;
      while ((m = pattern.exec(text)) !== null) {
        if (m[0].length === 0) {
          pattern.lastIndex++;
          continue;
        }
        raw.push({ start: m.index, end: m.index + m[0].length, category, prio });
      }
    });
  } catch {
    return [];
  }
  raw.sort((a, b) => a.start - b.start || b.end - a.end || a.prio - b.prio);
  const merged = [];
  let lastEnd = -1;
  for (const s of raw) {
    if (s.start >= lastEnd) {
      merged.push({ start: s.start, end: s.end, category: s.category });
      lastEnd = s.end;
    }
  }
  return merged;
}
export {
  detectVolatileSpans
};
