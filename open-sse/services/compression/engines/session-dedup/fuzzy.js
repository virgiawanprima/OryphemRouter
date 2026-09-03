import { buildCcrMarker, tryStoreBlock } from "../ccr/index.js";
const MAX_FUZZY_BLOCKS = 200;
function fnv1a(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function shingles(text, k = 3) {
  const words = text.split(/\s+/).filter(Boolean);
  const out = /* @__PURE__ */ new Set();
  if (words.length < k) return out;
  for (let i = 0; i + k <= words.length; i++) {
    out.add(fnv1a(words.slice(i, i + k).join(" ")));
  }
  return out;
}
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0;
  for (const x of small) if (large.has(x)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}
function findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize = 3) {
  if (blocks.length > maxBlocks) return [];
  const sets = blocks.map((b) => shingles(b.text, shingleSize));
  const out = [];
  for (let i = 0; i < blocks.length; i++) {
    let best = -1;
    let bestSim = 0;
    for (let j = 0; j < i; j++) {
      const sim = jaccard(sets[i], sets[j]);
      if (sim >= minJaccard && sim > bestSim) {
        bestSim = sim;
        best = j;
      }
    }
    if (best >= 0) {
      out.push({ block: blocks[i], matchedIndex: blocks[best].index, similarity: bestSim });
    }
  }
  return out;
}
function applyFuzzyPass(messages, opts) {
  try {
    const blocks = [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m.role === "system") continue;
      if (typeof m.content === "string" && m.content.length >= opts.minBlockChars) {
        blocks.push({ text: m.content, index: i });
      }
    }
    if (blocks.length < 2) return { messages, fuzzyCount: 0 };
    const nearDups = findNearDuplicates(blocks, opts.minJaccard, opts.maxBlocks, opts.shingleSize);
    if (nearDups.length === 0) return { messages, fuzzyCount: 0 };
    const replacements = /* @__PURE__ */ new Map();
    for (const nd of nearDups) {
      const stored = tryStoreBlock(nd.block.text, opts.principalId, { source: "session-dedup" });
      if (!stored.stored) continue;
      const marker = buildCcrMarker(stored.hash, nd.block.text.length);
      if (marker.length < nd.block.text.length) replacements.set(nd.block.index, marker);
    }
    if (replacements.size === 0) return { messages, fuzzyCount: 0 };
    const out = messages.map(
      (m, i) => replacements.has(i) ? { ...m, content: replacements.get(i) } : m
    );
    return { messages: out, fuzzyCount: replacements.size };
  } catch {
    return { messages, fuzzyCount: 0 };
  }
}
function runFuzzyPass(messages, stepConfig, minBlockChars, principalId) {
  const raw = stepConfig["fuzzy"];
  const cfg = typeof raw === "boolean" ? { enabled: raw } : raw;
  if (!cfg?.enabled) return { messages, fuzzyCount: 0 };
  return applyFuzzyPass(messages, {
    minJaccard: typeof cfg.minJaccard === "number" ? cfg.minJaccard : 0.85,
    shingleSize: typeof cfg.shingleSize === "number" ? cfg.shingleSize : 3,
    maxBlocks: MAX_FUZZY_BLOCKS,
    minBlockChars,
    principalId
  });
}
export {
  MAX_FUZZY_BLOCKS,
  applyFuzzyPass,
  findNearDuplicates,
  jaccard,
  runFuzzyPass,
  shingles
};
