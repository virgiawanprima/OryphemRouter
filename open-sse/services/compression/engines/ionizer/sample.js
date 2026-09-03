import { tryStoreBlock } from "../ccr/index.js";
const MAX_IONIZER_ROWS = 1e5;
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function() {
    a |= 0;
    a = a + 1831565813 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function schemaUnion(rows) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        out.push(key);
      }
    }
  }
  return out;
}
function isErrorRow(row) {
  for (const key of Object.keys(row)) {
    if (/error|fail|exception|stderr|denied/i.test(key) && row[key]) return true;
  }
  for (const k of ["status", "statusCode", "code"]) {
    const v = row[k];
    if (typeof v === "number" && v >= 400 && v <= 599) return true;
  }
  return false;
}
function seededSample(pool, k, seed) {
  if (k >= pool.length) return pool.slice();
  const idx = pool.map((_, i) => i);
  const rand = mulberry32(seed);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (idx.length - i));
    const tmp = idx[i];
    idx[i] = idx[j];
    idx[j] = tmp;
  }
  return idx.slice(0, k).sort((a, b) => a - b).map((i) => pool[i]);
}
function ionize(rows, opts) {
  const n = rows.length;
  if (n <= opts.targetRows) return { kept: rows, keptCount: n, totalCount: n };
  const keep = /* @__PURE__ */ new Set();
  const seenKeys = /* @__PURE__ */ new Set();
  for (let i = 0; i < n; i++) {
    let novel = false;
    for (const key of Object.keys(rows[i])) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        novel = true;
      }
    }
    if (novel) keep.add(i);
  }
  for (let i = 0; i < n; i++) if (isErrorRow(rows[i])) keep.add(i);
  for (let i = 0; i < Math.min(opts.firstK, n); i++) keep.add(i);
  for (let i = Math.max(0, n - opts.lastK); i < n; i++) keep.add(i);
  if (keep.size < opts.targetRows) {
    const middle = [];
    for (let i = 0; i < n; i++) if (!keep.has(i)) middle.push(i);
    const need = opts.targetRows - keep.size;
    for (const idx of seededSample(middle, need, opts.seed)) keep.add(idx);
  }
  const keptIdx = [...keep].sort((a, b) => a - b);
  return { kept: keptIdx.map((i) => rows[i]), keptCount: keptIdx.length, totalCount: n };
}
function isPlainObjectArray(v) {
  return Array.isArray(v) && v.every((el) => el !== null && typeof el === "object" && !Array.isArray(el));
}
function applyIonizerPass(messages, opts) {
  try {
    let ionizedCount = 0;
    const out = messages.map((m) => {
      if (m.role === "system" || typeof m.content !== "string") return m;
      const serialized = m.content;
      let parsed;
      try {
        parsed = JSON.parse(serialized);
      } catch {
        return m;
      }
      if (!Array.isArray(parsed) || parsed.length <= opts.threshold) return m;
      if (parsed.length > MAX_IONIZER_ROWS) return m;
      if (!isPlainObjectArray(parsed)) return m;
      const res = ionize(parsed, {
        targetRows: opts.targetRows,
        firstK: 3,
        lastK: 3,
        seed: fnv1a(serialized)
      });
      if (res.keptCount >= res.totalCount) return m;
      const stored = tryStoreBlock(serialized, opts.principalId, {
        contentType: "application/json",
        source: "ionizer"
      });
      if (!stored.stored) return m;
      const marker = `[ionizer: kept ${res.keptCount}/${res.totalCount} rows; full \u2192 CCR retrieve hash=${stored.hash} chars=${serialized.length}]`;
      const newContent = `${JSON.stringify(res.kept)}
${marker}`;
      if (newContent.length >= serialized.length) return m;
      ionizedCount++;
      return { ...m, content: newContent };
    });
    return ionizedCount > 0 ? { messages: out, ionizedCount } : { messages, ionizedCount: 0 };
  } catch {
    return { messages, ionizedCount: 0 };
  }
}
function runIonizerPass(messages, stepConfig, principalId) {
  if (stepConfig["enabled"] === false) return { messages, ionizedCount: 0 };
  const threshold = typeof stepConfig["threshold"] === "number" ? stepConfig["threshold"] : 200;
  const targetRows = typeof stepConfig["targetRows"] === "number" ? stepConfig["targetRows"] : 50;
  return applyIonizerPass(messages, { threshold, targetRows, principalId });
}
export {
  MAX_IONIZER_ROWS,
  applyIonizerPass,
  fnv1a,
  ionize,
  isErrorRow,
  runIonizerPass,
  schemaUnion,
  seededSample
};
