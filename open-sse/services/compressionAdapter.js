/**
 * compressionAdapter.js — clean facade over the ported OmniRoute compression suite
 * (`open-sse/services/compression/`).
 *
 * The ported suite is standalone and not yet consumed anywhere. This adapter is the
 * single integration point. It deliberately uses ONLY the synchronous `applyCompression`
 * entry (which runs in-process and never spawns a worker) because the async entry
 * imports `compressionWorkerProtocol.ts` (a file that does not exist in this port — only
 * `.js` exists) and `compressionWorker.js` intentionally throws when loaded outside a
 * worker thread.
 *
 * Everything is loaded lazily via dynamic `import()` inside try/catch so that a failure
 * anywhere in the compression suite degrades gracefully:
 *   - compressContext()  -> returns the input unchanged with `compressed:false`
 *   - estimateTokens()   -> falls back to a chars/4 heuristic
 *   - getAvailableEngines() -> returns []
 */

const COMPRESSION_ENTRY = "./compression/index.js";
const HARD_BUDGET_MODULE = "./compression/hardBudget.js";
const STATS_MODULE = "./compression/stats.js";

/** Default compression mode used when the caller does not pick one. */
const DEFAULT_MODE = "standard";

// ── lazy module holders ────────────────────────────────────────────────────
// `_statsPromise` warms up the (lightweight) token estimator so the synchronous
// estimateTokens() can use the ported estimator without blocking on a dynamic import.
// `_entryPromise` loads the full compression entry only on first actual use.
let _statsPromise = null;
let _entryPromise = null;
let _estimate = null;

function loadStats() {
  if (!_statsPromise) {
    _statsPromise = import(STATS_MODULE)
      .then((mod) => {
        _estimate = typeof mod?.estimateCompressionTokens === "function"
          ? mod.estimateCompressionTokens
          : null;
        return mod;
      })
      .catch(() => {
        _statsPromise = null;
        _estimate = null;
        return null;
      });
  }
  return _statsPromise;
}

function loadCompression() {
  if (!_entryPromise) {
    _entryPromise = import(COMPRESSION_ENTRY)
      .then((mod) => {
        // Make sure the builtin engines are registered (idempotent).
        try {
          if (typeof mod?.registerBuiltinCompressionEngines === "function") {
            mod.registerBuiltinCompressionEngines();
          }
        } catch {
          // Engine registration is best-effort; compression still works for
          // engine-less modes (lite/standard) even if registration fails.
        }
        return mod;
      })
      .catch(() => {
        _entryPromise = null;
        return null;
      });
  }
  return _entryPromise;
}

// Warm up the estimator at module load (best-effort, never throws).
loadStats();

// ── helpers ────────────────────────────────────────────────────────────────

function toCharEstimate(text) {
  let str;
  if (typeof text === "string") {
    str = text;
  } else if (text === null || text === undefined) {
    str = "";
  } else {
    try {
      str = JSON.stringify(text);
    } catch {
      str = String(text);
    }
  }
  return Math.ceil(str.length / 4);
}

function cloneMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages.map((m) => (m && typeof m === "object" ? { ...m } : m));
}

// ── public API ─────────────────────────────────────────────────────────────

/**
 * Estimate the token count of a text (or message body).
 * Uses the ported estimator when available; otherwise falls back to
 * `Math.ceil(text.length / 4)`.
 *
 * @param {string|object} text
 * @returns {number}
 */
export function estimateTokens(text) {
  if (_estimate) {
    try {
      const n = Number(_estimate(text));
      if (Number.isFinite(n) && n >= 0) return n;
    } catch {
      // fall through to char heuristic
    }
  }
  return toCharEstimate(text);
}

/**
 * Compress a message list using the ported compression suite.
 *
 * @param {object} options
 * @param {Array<{role:string,content:any}>} options.messages - input messages
 * @param {string} [options.model] - model id (used for tokenizer context)
 * @param {number} [options.maxTokens] - if set, enforce a hard budget after compression
 * @param {string|Array} [options.system] - optional system prompt to carry through
 * @param {string} [options.mode] - override the default compression mode
 * @returns {Promise<{messages:Array, compressed:boolean, tokensSaved:number}>}
 *   On any error, returns the input messages unchanged with `compressed:false`.
 */
export async function compressContext(options) {
  const opts = options && typeof options === "object" ? options : {};
  const { messages, model, maxTokens, system, mode } = opts;
  const input = cloneMessages(messages);
  const fallback = { messages: input, compressed: false, tokensSaved: 0 };
  const originalBody = {
    messages: input,
    ...(typeof model === "string" && model ? { model } : {}),
    ...(system !== undefined && system !== null ? { system } : {})
  };

  try {
    const entry = await loadCompression();
    if (!entry || typeof entry.applyCompression !== "function") {
      return fallback;
    }

    const compressionMode = typeof mode === "string" && mode ? mode : DEFAULT_MODE;
    const result = entry.applyCompression(originalBody, compressionMode, { model });

    let outBody = result && result.body && typeof result.body === "object"
      ? result.body
      : originalBody;

    // Enforce an explicit token budget as a final pass when still over budget.
    if (Number.isFinite(maxTokens) && maxTokens > 0) {
      try {
        if (estimateTokens(outBody) > maxTokens) {
          const hb = await import(HARD_BUDGET_MODULE);
          if (hb && typeof hb.applyHardBudget === "function") {
            const hbResult = hb.applyHardBudget(outBody, { targetTokens: Math.floor(maxTokens) });
            if (hbResult && hbResult.body && typeof hbResult.body === "object") {
              outBody = hbResult.body;
            }
          }
        }
      } catch {
        // Hard-budget enforcement is best-effort; keep the compressed body.
      }
    }

    const outMessages = Array.isArray(outBody.messages) ? outBody.messages : input;
    const originalTokens = estimateTokens(originalBody);
    const finalTokens = estimateTokens(outBody);
    const tokensSaved = Math.max(0, Math.round(originalTokens - finalTokens));

    return {
      messages: outMessages,
      compressed: result?.compressed === true || tokensSaved > 0,
      tokensSaved
    };
  } catch {
    return fallback;
  }
}

/**
 * List the compression engine ids registered by the ported suite.
 * Returns [] if the suite cannot be loaded.
 *
 * @returns {Promise<string[]>}
 */
export async function getAvailableEngines() {
  try {
    const entry = await loadCompression();
    if (!entry) return [];

    if (typeof entry.listEngines === "function") {
      const entries = entry.listEngines();
      if (Array.isArray(entries)) {
        return entries
          .map((e) => (e && e.engine && typeof e.engine.id === "string" ? e.engine.id : null))
          .filter(Boolean);
      }
    }
    if (typeof entry.listCompressionEngines === "function") {
      const engines = entry.listCompressionEngines();
      if (Array.isArray(engines)) {
        return engines
          .map((e) => (e && typeof e.id === "string" ? e.id : null))
          .filter(Boolean);
      }
    }
    return [];
  } catch {
    return [];
  }
}
