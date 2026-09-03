const OPENAI_MODEL_DEPRECATIONS_URL = "https://developers.openai.com/api/docs/deprecations";
const OPENAI_SOURCE = OPENAI_MODEL_DEPRECATIONS_URL;
function openAiRecord(model, shutdownAt, replacement, kind, notes) {
  return {
    provider: "openai",
    model,
    shutdownAt,
    replacement: replacement ? {
      provider: "openai",
      model: replacement,
      ...notes ? { notes } : {}
    } : null,
    kind,
    source: OPENAI_SOURCE
  };
}
const MODEL_LIFECYCLE_RECORDS = Object.freeze([
  openAiRecord("computer-use-preview-2025-03-11", "2026-07-23", "gpt-5.6-terra", "computer-use"),
  openAiRecord("computer-use-preview", "2026-07-23", "gpt-5.6-terra", "computer-use"),
  openAiRecord("gpt-4o-mini-search-preview-2025-03-11", "2026-07-23", "gpt-5.6-terra", "search"),
  openAiRecord("gpt-4o-search-preview-2025-03-11", "2026-07-23", "gpt-5.6-terra", "search"),
  openAiRecord("gpt-4o-mini-tts-2025-03-20", "2026-07-23", "gpt-4o-mini-tts-2025-12-15", "speech"),
  openAiRecord("gpt-5-chat-latest", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5-codex", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5.1-chat-latest", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5.1-codex", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5.1-codex-max", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5.1-codex-mini", "2026-07-23", "gpt-5.6-terra", "text"),
  openAiRecord("gpt-5.2-codex", "2026-07-23", "gpt-5.6-sol", "text"),
  openAiRecord("o3-deep-research-2025-06-26", "2026-07-23", "gpt-5.6-sol", "deep-research"),
  openAiRecord("o3-deep-research", "2026-07-23", "gpt-5.6-sol", "deep-research"),
  openAiRecord("o4-mini-deep-research-2025-06-26", "2026-07-23", "gpt-5.6-sol", "deep-research"),
  openAiRecord("o4-mini-deep-research", "2026-07-23", "gpt-5.6-sol", "deep-research"),
  openAiRecord("gpt-audio-mini-2025-10-06", "2026-07-23", "gpt-audio-1.5", "audio"),
  openAiRecord("gpt-realtime-mini-2025-10-06", "2026-07-23", "gpt-realtime-2.1-mini", "realtime"),
  openAiRecord("gpt-5.2-chat-latest", "2026-08-10", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-5.3-chat-latest", "2026-08-10", "gpt-5.6-sol", "text"),
  openAiRecord("gpt-3.5-turbo-0125", "2026-10-23", "gpt-5.6-terra", "text"),
  openAiRecord("gpt-4-0314", "2026-03-26", null, "text"),
  openAiRecord("gpt-4-0125-preview", "2026-03-26", null, "text"),
  openAiRecord("gpt-4-turbo-preview", "2026-03-26", null, "text")
]);
const RECORDS_BY_KEY = /* @__PURE__ */ new Map();
function lifecycleKey(provider, model) {
  return `${provider.trim().toLowerCase()}\0${model.trim()}`;
}
for (const record of MODEL_LIFECYCLE_RECORDS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(record.shutdownAt)) {
    throw new Error(
      `Invalid model lifecycle shutdown date for ${record.provider}/${record.model}: ${record.shutdownAt}`
    );
  }
  const key = lifecycleKey(record.provider, record.model);
  if (RECORDS_BY_KEY.has(key)) {
    throw new Error(`Duplicate model lifecycle record: ${record.provider}/${record.model}`);
  }
  if (record.replacement) Object.freeze(record.replacement);
  RECORDS_BY_KEY.set(key, Object.freeze(record));
}
function toTimestamp(asOf) {
  const value = asOf instanceof Date ? asOf.getTime() : typeof asOf === "number" ? asOf : Date.parse(asOf);
  if (!Number.isFinite(value)) {
    throw new TypeError(`Invalid model lifecycle date: ${String(asOf)}`);
  }
  return value;
}
function shutdownTimestamp(shutdownAt) {
  return Date.parse(`${shutdownAt}T00:00:00.000Z`);
}
function getModelLifecycleDecision(provider, model, asOf = Date.now()) {
  const normalizedProvider = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const normalizedModel = typeof model === "string" ? model.trim() : "";
  const record = RECORDS_BY_KEY.get(lifecycleKey(normalizedProvider, normalizedModel));
  if (!record) {
    return {
      provider: normalizedProvider,
      model: normalizedModel,
      status: "untracked",
      action: "allow",
      shutdownAt: null,
      replacement: null,
      source: null
    };
  }
  const status = toTimestamp(asOf) >= shutdownTimestamp(record.shutdownAt) ? "shutdown" : "deprecated";
  return {
    provider: record.provider,
    model: record.model,
    status,
    action: status === "shutdown" ? "reject" : "warn",
    shutdownAt: record.shutdownAt,
    replacement: record.replacement,
    source: record.source
  };
}
function formatModelLifecycleMessage(decision) {
  if (decision.status === "untracked") return null;
  const modelRef = `${decision.provider}/${decision.model}`;
  const replacement = decision.replacement ? ` Use "${decision.replacement.provider}/${decision.replacement.model}" instead.` : "";
  if (decision.status === "shutdown") {
    return `Model "${modelRef}" was shut down on ${decision.shutdownAt} and cannot be routed automatically.${replacement}`;
  }
  return `Model "${modelRef}" is deprecated and is scheduled to shut down on ${decision.shutdownAt}.${replacement}`;
}
function filterSelectableModels(provider, models, {
  asOf = Date.now(),
  includeDeprecated = false,
  includeShutdown = false
} = {}) {
  return models.filter(
    (model) => isModelSelectable(provider, model.id, {
      asOf,
      includeDeprecated,
      includeShutdown
    })
  );
}
function isModelSelectable(provider, model, {
  asOf = Date.now(),
  includeDeprecated = false,
  includeShutdown = false
} = {}) {
  const decision = getModelLifecycleDecision(provider, model, asOf);
  if (decision.status === "deprecated") return includeDeprecated;
  if (decision.status === "shutdown") return includeShutdown;
  return true;
}
export {
  MODEL_LIFECYCLE_RECORDS,
  OPENAI_MODEL_DEPRECATIONS_URL,
  filterSelectableModels,
  formatModelLifecycleMessage,
  getModelLifecycleDecision,
  isModelSelectable
};
