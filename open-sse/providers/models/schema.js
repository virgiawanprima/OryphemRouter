import { deriveModelName } from "./namePatterns.js";

// Normalize version separators in a model id: hyphen between two digits becomes a dot.
// Registry ids use dots for versions ("claude-sonnet-4.5") but clients (CLIs, aliases)
// often send them with dashes ("claude-sonnet-4-5"). Only digit-digit hyphens are
// touched, so word/suffix hyphens stay intact ("-thinking", "-agentic", "qwen3-coder-next").
export function normalizeModelId(modelId) {
  if (typeof modelId !== "string") return modelId;
  return modelId.replace(/(\d)-(\d)/g, "$1.$2");
}

// Model defaults centralized (was scattered as `m.kind || "llm"`, `quotaFamily || "normal"`, etc.)
export const MODEL_DEFAULTS = {
  kind: "llm",
  quotaFamily: "normal",
  strip: [],
  targetFormat: null
};

// Normalize a registry model entry: accept terse "id" string, fill name via regex when omitted.
// Override always wins (raw spread last); name falls back to regex → id.
export function normalizeModel(raw) {
  const model = typeof raw === "string" ? { id: raw } : raw;
  if (model.name !== undefined) return model;
  return { ...model, name: deriveModelName(model.id) };
}

// Resolve model kind with default (accepts legacy `type` field)
export function modelKind(model) {
  return model?.kind || model?.type || MODEL_DEFAULTS.kind;
}
export function modelQuotaFamily(model) {
  return model?.quotaFamily || MODEL_DEFAULTS.quotaFamily;
}
export function modelStrip(model) {
  return model?.strip || [];
}
export function modelTargetFormat(model) {
  return model?.targetFormat || MODEL_DEFAULTS.targetFormat;
}

// Per-model declared upstream formats (e.g. ["openai", "claude"]). Guards the
// sourceFormat-matched transport for multi-endpoint providers whose models differ
// in endpoint support (opencode-go: kimi/glm only do /chat/completions, minimax/qwen
// also do /messages, deepseek also does /responses).
//
// WHEN THIS IS REQUIRED vs WHEN THE PROVIDER-LEVEL transports[] SUFFICES
// (audited across the whole registry 2026-09-16 — 9 providers declare transports, 90 models
// declare formats): declare per-model formats ONLY when the models really differ. Seven
// providers (deepseek, glm, kimi, minimax, minimax-cn, xiaomi-mimo, xiaomi-tokenplan) serve
// every model over both of their wire formats, so their provider-level transports[] is the
// whole truth and no model needs a declaration. The two opencode providers are the opposite
// case — zen alone mixes /chat/completions, /messages and /responses across its catalog — so
// there a model without a declaration would be routed by the *client's* format, and a claude
// client asking for a chat-only model would be sent to /messages. That asymmetry is the whole
// reason this field exists.
//
// A declaration must name a format the provider actually offers — declaring one without a
// matching transports[] entry is a route that cannot be taken. tests/unit/
// registry-transport-declarations.test.js enforces exactly that, registry-wide.
export function modelSupportedFormats(model) {
  return model?.supportedFormats || null;
}
