import { createCompressionStats, estimateCompressionTokens } from "../../stats.js";
import { extractPreservedBlocks } from "../../preservation.js";
import { workerBackend } from "./worker.js";
import { LLMLINGUA_MODELS, DEFAULT_LLMLINGUA_MODEL } from "./constants.js";
let _backend = null;
function setLlmlinguaBackend(b) {
  _backend = b;
}
function resolveBackend() {
  return _backend ?? workerBackend;
}
function splitProseAndPreserved(text) {
  const { text: withPlaceholders, blocks } = extractPreservedBlocks(text);
  if (blocks.length === 0) {
    return [{ kind: "prose", text }];
  }
  const segments = [];
  const placeholderToOriginal = new Map(blocks.map((b) => [b.placeholder, b.content]));
  const escapedPhs = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const splitRe = new RegExp(`(${escapedPhs.join("|")})`, "g");
  const parts = withPlaceholders.split(splitRe);
  for (const part of parts) {
    if (!part) continue;
    const original = placeholderToOriginal.get(part);
    if (original !== void 0) {
      segments.push({ kind: "preserved", text: original });
    } else {
      segments.push({ kind: "prose", text: part });
    }
  }
  return segments;
}
async function compressProseText(text, backend, opts) {
  if (!text.trim()) return { text, didCompress: false };
  try {
    const compressed = await backend(text, opts);
    if (typeof compressed === "string" && compressed.length < text.length) {
      return { text: compressed, didCompress: true };
    }
    return { text, didCompress: false };
  } catch {
    return { text, didCompress: false };
  }
}
async function compressMessageText(text, backend, opts) {
  const segments = splitProseAndPreserved(text);
  let anyCompressed = false;
  const parts = [];
  for (const seg of segments) {
    if (seg.kind === "preserved") {
      parts.push(seg.text);
    } else {
      const { text: out, didCompress } = await compressProseText(seg.text, backend, opts);
      parts.push(out);
      if (didCompress) anyCompressed = true;
    }
  }
  return { text: parts.join(""), didCompress: anyCompressed };
}
async function processMessages(messages, backend, opts) {
  let compressedCount = 0;
  const result = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      result.push({ ...msg });
      continue;
    }
    try {
      if (typeof msg.content === "string") {
        const { text, didCompress } = await compressMessageText(msg.content, backend, opts);
        if (didCompress) {
          compressedCount++;
          result.push({ ...msg, content: text });
        } else {
          result.push({ ...msg });
        }
      } else if (Array.isArray(msg.content)) {
        let changed = false;
        const newContent = [];
        for (const part of msg.content) {
          if (part["type"] === "text" && typeof part["text"] === "string") {
            const { text, didCompress } = await compressMessageText(
              part["text"],
              backend,
              opts
            );
            if (didCompress) {
              changed = true;
              compressedCount++;
              newContent.push({ ...part, text });
            } else {
              newContent.push(part);
            }
          } else {
            newContent.push(part);
          }
        }
        result.push(changed ? { ...msg, content: newContent } : { ...msg });
      } else {
        result.push({ ...msg });
      }
    } catch {
      result.push({ ...msg });
    }
  }
  return { messages: result, compressedCount };
}
const LLMLINGUA_SCHEMA = [
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: true },
  {
    key: "model",
    type: "select",
    label: "Model",
    defaultValue: DEFAULT_LLMLINGUA_MODEL,
    options: Object.values(LLMLINGUA_MODELS).map((m) => ({ value: m.id, label: m.label }))
  },
  {
    key: "minTokens",
    type: "number",
    label: "Min tokens (floor)",
    defaultValue: 2e3,
    min: 0,
    max: 1e5
  },
  {
    key: "compressionRate",
    type: "number",
    label: "Compression rate (keep ratio)",
    defaultValue: 0.5,
    min: 0.1,
    max: 0.9
  },
  { key: "modelPath", type: "string", label: "Model path (offline override)", defaultValue: "" }
];
function validateLlmlinguaConfig(config) {
  const errors = [];
  if (config["enabled"] !== void 0 && typeof config["enabled"] !== "boolean") {
    errors.push("enabled must be a boolean");
  }
  if (config["model"] !== void 0) {
    const model = config["model"];
    if (typeof model !== "string" || !(model in LLMLINGUA_MODELS)) {
      errors.push("model must be one of: " + Object.keys(LLMLINGUA_MODELS).join(", "));
    }
  }
  if (config["minTokens"] !== void 0) {
    const minTokens = config["minTokens"];
    if (typeof minTokens !== "number" || Number.isNaN(minTokens) || minTokens < 0) {
      errors.push("minTokens must be a number >= 0");
    }
  }
  if (config["compressionRate"] !== void 0) {
    const rate = config["compressionRate"];
    if (typeof rate !== "number" || Number.isNaN(rate) || rate < 0.1 || rate > 0.9) {
      errors.push("compressionRate must be a number between 0.1 and 0.9");
    }
  }
  if (config["modelPath"] !== void 0 && typeof config["modelPath"] !== "string") {
    errors.push("modelPath must be a string");
  }
  return { valid: errors.length === 0, errors };
}
const ENGINE_ID = "llmlingua";
const llmlinguaEngine = {
  id: ENGINE_ID,
  name: "LLMLingua-2 (Semantic Pruning)",
  description: "Async semantic token pruning via LLMLingua-2 (ONNX/worker-thread backend). Compresses prose in non-system messages; fenced code blocks and other preserved constructs are never altered. Fail-opens on any backend error. Production backend: @atjsh/llmlingua-2 (TinyBERT 57 MB default, BERT-base optional) in a worker thread; model lazy-downloaded to DATA_DIR. Optional deps \u2014 fail-opens if not installed.",
  icon: "brain",
  targets: ["messages"],
  stackable: true,
  // stackPriority 35: runs after structural engines (CCR=4, session-dedup=3,
  // headroom=15, caveman=20) but before ultra (40). Semantic pruning is more
  // effective on already-structurally-compressed text.
  stackPriority: 35,
  metadata: {
    id: ENGINE_ID,
    name: "LLMLingua-2 (Semantic Pruning)",
    description: "ONNX-based semantic token classification. Compresses prose only; code blocks and preserved constructs are protected. Fail-open on model/worker error.",
    inputScope: "messages",
    targetLatencyMs: 200,
    supportsPreview: false,
    // Stable. The worker model itself was VPS-validated (real prose 209→107 ch, ok=true),
    // but the EARLIER "walk-up + optional-deps gate confirmed in the bundle" claim was
    // wrong: the Next standalone bundle (webpack) froze `import.meta.url` to the build path
    // and stubbed `createRequire`, so in production the gate was always false and the worker
    // never spawned (it silently fell back to the aggressive summarizer). Fixed in B-SLM —
    // worker.ts now resolves deps + worker file from runtime anchors (cwd / argv[1]). The
    // optional deps must also be co-located into dist/node_modules (#4286) to actually run.
    stable: true
  },
  /**
   * Synchronous pass-through.
   *
   * The real compression is async-only (worker-thread model). The sync path
   * exists only so this engine is safe in sync stacked pipelines — it does
   * nothing and returns the body unchanged. `applyStackedCompressionAsync`
   * will call `applyAsync` instead.
   */
  apply(body) {
    return { body, compressed: false, stats: null };
  },
  /**
   * Async compression path.
   *
   * For each non-system message, splits text into prose/preserved segments,
   * sends only prose to the backend, and re-stitches with preserved segments
   * (fenced code, inline code, math, etc.) untouched.
   *
   * Fail-open contract:
   *   - Backend rejection/error per prose segment → segment kept as-is.
   *   - Any unexpected outer error → original body returned, no throw.
   */
  async applyAsync(body, options) {
    const stepConfig = options?.stepConfig ?? {};
    if (stepConfig["enabled"] === false) {
      return { body, compressed: false, stats: null };
    }
    const messages = body["messages"];
    if (!Array.isArray(messages) || messages.length === 0) {
      return { body, compressed: false, stats: null };
    }
    const minTokens = typeof stepConfig["minTokens"] === "number" ? stepConfig["minTokens"] : 2e3;
    if (minTokens > 0) {
      const nonSystemText = messages.filter((m) => m.role !== "system").map((m) => typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? "")).join("\n");
      if (estimateCompressionTokens(nonSystemText) < minTokens) {
        return { body, compressed: false, stats: null };
      }
    }
    const backendOpts = {
      model: typeof stepConfig["model"] === "string" ? stepConfig["model"] : void 0,
      compressionRate: typeof stepConfig["compressionRate"] === "number" ? stepConfig["compressionRate"] : void 0,
      modelPath: typeof stepConfig["modelPath"] === "string" && stepConfig["modelPath"] ? stepConfig["modelPath"] : void 0
    };
    try {
      const backend = resolveBackend();
      const start = performance.now();
      const { messages: newMessages, compressedCount } = await processMessages(
        messages,
        backend,
        backendOpts
      );
      if (compressedCount === 0) {
        return { body, compressed: false, stats: null };
      }
      const newBody = { ...body, messages: newMessages };
      const durationMs = Math.round(performance.now() - start);
      const stats = createCompressionStats(
        body,
        newBody,
        "stacked",
        [ENGINE_ID],
        [`llmlingua-compressed-${compressedCount}-messages`],
        durationMs
      );
      return { body: newBody, compressed: true, stats };
    } catch {
      return { body, compressed: false, stats: null };
    }
  },
  compress(body, config) {
    return this.apply(body, { stepConfig: config ?? {} });
  },
  getConfigSchema() {
    return LLMLINGUA_SCHEMA;
  },
  validateConfig(config) {
    return validateLlmlinguaConfig(config);
  }
};
export {
  llmlinguaEngine,
  setLlmlinguaBackend
};
