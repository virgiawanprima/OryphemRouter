const layers = {
  tool: /* @__PURE__ */ new Map(),
  // e.g. "cursor" → Set of signature patterns
  family: /* @__PURE__ */ new Map(),
  // e.g. "claude-sonnet" → Set of signature patterns
  session: /* @__PURE__ */ new Map()
  // e.g. sessionId → Set of signature patterns
};
const DEFAULT_SIGNATURES = [
  "<antThinking>",
  "</antThinking>",
  "<thinking>",
  "</thinking>",
  "<internal_thought>",
  "</internal_thought>"
];
const MAX_ENTRIES_PER_LAYER = 100;
const MAX_PATTERNS_PER_KEY = 20;
function getSignatures(context = {}) {
  const patterns = new Set(DEFAULT_SIGNATURES);
  if (context.tool && layers.tool.has(context.tool)) {
    for (const p of layers.tool.get(context.tool)) patterns.add(p);
  }
  if (context.modelFamily && layers.family.has(context.modelFamily)) {
    for (const p of layers.family.get(context.modelFamily)) patterns.add(p);
  }
  if (context.sessionId && layers.session.has(context.sessionId)) {
    for (const p of layers.session.get(context.sessionId)) patterns.add(p);
  }
  return Array.from(patterns);
}
function addSignature(pattern, context = {}) {
  if (!pattern || typeof pattern !== "string") return;
  const addToLayer = (layer, key) => {
    if (!key) return;
    if (!layer.has(key)) {
      if (layer.size >= MAX_ENTRIES_PER_LAYER) {
        const firstKey = layer.keys().next().value;
        layer.delete(firstKey);
      }
      layer.set(key, /* @__PURE__ */ new Set());
    }
    const set = layer.get(key);
    if (set.size < MAX_PATTERNS_PER_KEY) {
      set.add(pattern);
    }
  };
  addToLayer(layers.tool, context.tool);
  addToLayer(layers.family, context.modelFamily);
  addToLayer(layers.session, context.sessionId);
}
function detectAndLearn(text, context = {}) {
  if (!text || typeof text !== "string") return { found: [], cleaned: text };
  const found = [];
  let cleaned = text;
  const known = getSignatures(context);
  for (const sig of known) {
    if (cleaned.includes(sig)) {
      found.push(sig);
      cleaned = cleaned.split(sig).join("");
    }
  }
  const tagRegex = /<\/?([a-zA-Z_][a-zA-Z0-9_]*(?:Thinking|thinking|thought|Thought|internal_thought))>/g;
  let match;
  while ((match = tagRegex.exec(text)) !== null) {
    const tag = match[0];
    if (!known.includes(tag)) {
      found.push(tag);
      addSignature(tag, context);
      cleaned = cleaned.split(tag).join("");
    }
  }
  if (found.length > 0) {
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  }
  return { found, cleaned: cleaned.trim() || cleaned };
}
function getModelFamily(model) {
  if (!model) return null;
  const modelName = typeof model === "string" ? model : String(model);
  const cleaned = modelName.replace(/-\d{4}-\d{2}-\d{2}$/, "").replace(/-\d{8,}$/, "").replace(/-\d+(\.\d+)*$/, "").replace(/@.*$/, "");
  return cleaned || modelName;
}
function getCacheStats() {
  return {
    tool: {
      entries: layers.tool.size,
      patterns: Array.from(layers.tool.values()).reduce((sum, s) => sum + s.size, 0)
    },
    family: {
      entries: layers.family.size,
      patterns: Array.from(layers.family.values()).reduce((sum, s) => sum + s.size, 0)
    },
    session: {
      entries: layers.session.size,
      patterns: Array.from(layers.session.values()).reduce((sum, s) => sum + s.size, 0)
    },
    defaultCount: DEFAULT_SIGNATURES.length
  };
}
function clearCache() {
  layers.tool.clear();
  layers.family.clear();
  layers.session.clear();
}
export {
  addSignature,
  clearCache,
  detectAndLearn,
  getCacheStats,
  getModelFamily,
  getSignatures
};
