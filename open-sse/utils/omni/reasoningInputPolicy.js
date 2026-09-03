import { REGISTRY } from "./providerRegistryStub.js";
import { isValidResponsesItemId } from "./responsesItemId.js";
const REASONING_TRANSPORTS = /* @__PURE__ */ new Map();
for (const [id, entry] of Object.entries(REGISTRY)) {
  if (!entry.reasoningTransport) continue;
  REASONING_TRANSPORTS.set(id.toLowerCase(), entry.reasoningTransport);
  if (entry.alias) {
    REASONING_TRANSPORTS.set(entry.alias.toLowerCase(), entry.reasoningTransport);
  }
}
const CHAT_PLAINTEXT_REASONING_FIELDS = [
  "reasoning_content",
  "reasoning",
  "reasoning_text",
  "thinking",
  "thought"
];
function resolveReasoningTransport(provider, preserveEncryptedReasoning = false) {
  const normalized = typeof provider === "string" ? provider.trim().toLowerCase() : "";
  const transport = REASONING_TRANSPORTS.get(normalized);
  return transport ?? (preserveEncryptedReasoning ? "opaque" : "plaintext");
}
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function isSummaryDetail(record) {
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  return type.includes("summary") || record.summary !== void 0 || record.summary_text !== void 0;
}
function hasPlaintextReasoning(record) {
  return Array.isArray(record.content) && record.content.some((part) => {
    const value = asRecord(part);
    return value?.type === "reasoning_text" && isNonEmptyString(value.text);
  });
}
function hasChatPlaintextReasoning(record) {
  if (CHAT_PLAINTEXT_REASONING_FIELDS.some((field) => isNonEmptyString(record[field]))) {
    return true;
  }
  if (!Array.isArray(record.reasoning_details)) return false;
  return record.reasoning_details.some((detail) => {
    const value = asRecord(detail);
    return Boolean(
      value && !isSummaryDetail(value) && (isNonEmptyString(value.text) || isNonEmptyString(value.content))
    );
  });
}
function extractReplayableResponsesReasoningText(value) {
  const record = asRecord(value);
  if (!record || record.type !== "reasoning") return "";
  if (!Array.isArray(record.content)) return "";
  return record.content.map((part) => {
    const content = asRecord(part);
    return content?.type === "reasoning_text" && typeof content.text === "string" ? content.text : "";
  }).filter((text) => text.trim().length > 0).join("\n\n");
}
function hasOpaqueReasoningState(record) {
  return isNonEmptyString(record.encrypted_content) || record.signature !== void 0 || record.format !== void 0;
}
function hasOpaqueReasoningDetail(value) {
  const record = asRecord(value);
  if (!record) return false;
  const type = typeof record.type === "string" ? record.type.toLowerCase() : "";
  return hasOpaqueReasoningState(record) || (type.includes("encrypted") || type.includes("opaque")) && isNonEmptyString(record.data);
}
function hasChatOpaqueReasoning(record) {
  return hasOpaqueReasoningState(record) || Array.isArray(record.reasoning_details) && record.reasoning_details.some(hasOpaqueReasoningDetail);
}
function inspectChatReasoning(messages) {
  const inspection = { hasPlaintext: false, hasOpaque: false };
  if (!Array.isArray(messages)) return inspection;
  for (const message of messages) {
    const record = asRecord(message);
    if (!record || record.role !== "assistant") continue;
    inspection.hasPlaintext ||= hasChatPlaintextReasoning(record);
    inspection.hasOpaque ||= hasChatOpaqueReasoning(record);
    if (inspection.hasPlaintext && inspection.hasOpaque) break;
  }
  return inspection;
}
function inspectResponsesReasoning(input) {
  const inspection = { hasPlaintext: false, hasOpaque: false };
  if (!Array.isArray(input)) return inspection;
  for (const item of input) {
    const record = asRecord(item);
    if (!record || record.type !== "reasoning") continue;
    inspection.hasPlaintext ||= hasPlaintextReasoning(record);
    inspection.hasOpaque ||= hasOpaqueReasoningState(record);
    if (inspection.hasPlaintext && inspection.hasOpaque) break;
  }
  return inspection;
}
function isReasoningCompatible(inspection, transport) {
  if (!inspection.hasPlaintext && !inspection.hasOpaque) return true;
  if (transport === "plaintext") return !inspection.hasOpaque;
  if (transport === "opaque") return !inspection.hasPlaintext;
  return false;
}
function stripOpaqueFields(record) {
  delete record.encrypted_content;
  delete record.signature;
  delete record.format;
  delete record.data;
}
function stripChatReasoningDetails(details, transport) {
  return details.flatMap((detail) => {
    const record = asRecord(detail);
    if (!record) return [detail];
    const plaintext = !isSummaryDetail(record) && (isNonEmptyString(record.text) || isNonEmptyString(record.content));
    const opaque = hasOpaqueReasoningDetail(record);
    if ((!plaintext || transport === "plaintext") && (!opaque || transport === "opaque")) {
      return [detail];
    }
    const next = { ...record };
    if (plaintext && transport !== "plaintext") {
      delete next.text;
      delete next.content;
    }
    if (opaque && transport !== "opaque") stripOpaqueFields(next);
    const remainingKeys = Object.keys(next).filter((key) => key !== "type");
    return remainingKeys.length > 0 ? [next] : [];
  });
}
function dropIncompatibleChatReasoning(messages, transport) {
  return messages.map((message) => {
    const record = asRecord(message);
    if (!record || record.role !== "assistant") return message;
    const next = { ...record };
    if (transport !== "plaintext") {
      for (const field of CHAT_PLAINTEXT_REASONING_FIELDS) delete next[field];
    }
    if (transport !== "opaque") stripOpaqueFields(next);
    if (Array.isArray(record.reasoning_details)) {
      const details = stripChatReasoningDetails(record.reasoning_details, transport);
      if (details.length > 0) next.reasoning_details = details;
      else delete next.reasoning_details;
    }
    return next;
  });
}
function hasDisplaySummary(record) {
  return record.summary !== void 0 || record.summary_text !== void 0;
}
function dropIncompatibleResponsesReasoning(record, transport) {
  const next = { ...record };
  if (transport !== "plaintext" && Array.isArray(record.content)) {
    const content = record.content.filter((part) => asRecord(part)?.type !== "reasoning_text");
    if (content.length > 0) next.content = content;
    else delete next.content;
  }
  if (transport !== "opaque") stripOpaqueFields(next);
  const stillActive = hasPlaintextReasoning(next) || hasOpaqueReasoningState(next);
  return stillActive || hasDisplaySummary(next) ? next : null;
}
function sanitizeResponsesInput(input, transport, dropIncompatible, stripOrphanedSummaries) {
  const filtered = [];
  for (const item of input) {
    if (typeof item === "string") continue;
    const record = asRecord(item);
    if (!record) {
      filtered.push(item);
      continue;
    }
    if (record.type === "item_reference") continue;
    if (record.type === "reasoning") {
      const next = dropIncompatible ? dropIncompatibleResponsesReasoning(record, transport) : { ...record };
      if (!next) continue;
      const hasPlaintext = hasPlaintextReasoning(next);
      const hasOpaque = hasOpaqueReasoningState(next);
      if (!hasPlaintext && !hasOpaque && (!hasDisplaySummary(next) || stripOrphanedSummaries)) {
        continue;
      }
      if (!hasOpaque || !isValidResponsesItemId(next.id)) delete next.id;
      if (hasOpaque && next.summary === void 0) next.summary = [];
      filtered.push(next);
      continue;
    }
    const cloned = { ...record };
    if (cloned.id !== void 0) delete cloned.id;
    filtered.push(cloned);
  }
  return filtered;
}
function applyReasoningInputPolicy(body, inputFormat, options = {}) {
  const transport = resolveReasoningTransport(options.provider, options.preserveEncryptedReasoning);
  const inspection = inputFormat === "responses" ? inspectResponsesReasoning(body.input) : inspectChatReasoning(body.messages);
  const mixedState = inspection.hasPlaintext && inspection.hasOpaque;
  const incompatibleReasoning = !mixedState && !isReasoningCompatible(inspection, transport);
  if (incompatibleReasoning && options.onIncompatibleReasoning === "reject") {
    return { incompatibleReasoning: true };
  }
  if (inputFormat === "chat") {
    if ((incompatibleReasoning || mixedState) && Array.isArray(body.messages)) {
      body.messages = dropIncompatibleChatReasoning(body.messages, transport);
    }
    return { incompatibleReasoning: false };
  }
  if (Array.isArray(body.input) && body.input.length === 0) {
    body.input = [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "continue" }]
      }
    ];
  }
  if (Array.isArray(body.input)) {
    body.input = sanitizeResponsesInput(
      body.input,
      transport,
      incompatibleReasoning || mixedState,
      body.store === false
    );
  }
  return { incompatibleReasoning: false };
}
function createReasoningTransportIncompatibleError() {
  const error = new Error(
    "Reasoning continuation is not compatible with the selected target"
  );
  error.statusCode = 400;
  error.errorType = "reasoning_transport_incompatible";
  return error;
}
const REASONING_FALLBACK_HEADER = "x-omniroute-reasoning-fallback";
function readFallbackHeader(headers) {
  if (!headers) return null;
  if (headers instanceof Headers) {
    const value = headers.get(REASONING_FALLBACK_HEADER);
    return typeof value === "string" ? value : null;
  }
  if (typeof headers !== "object") return null;
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === REASONING_FALLBACK_HEADER && typeof value === "string") {
      return value;
    }
  }
  return null;
}
function resolveIncompatibleReasoningAction(options) {
  if (options.reasoningTransportFallback === "drop") return "drop";
  if (options.isComboStep && options.reasoningTransportFallback === "skip") return "reject";
  const headerRaw = readFallbackHeader(options.headers)?.trim().toLowerCase();
  if (headerRaw === "reject") return "reject";
  if (headerRaw === "drop") return "drop";
  const envRaw = (options.env ?? process.env).OMNIROUTE_SINGLE_TARGET_REASONING_FALLBACK?.trim().toLowerCase();
  if (envRaw === "reject") return "reject";
  if (envRaw === "drop") return "drop";
  return "drop";
}
export {
  REASONING_FALLBACK_HEADER,
  applyReasoningInputPolicy,
  createReasoningTransportIncompatibleError,
  extractReplayableResponsesReasoningText,
  hasOpaqueReasoningState,
  inspectChatReasoning,
  inspectResponsesReasoning,
  resolveIncompatibleReasoningAction,
  resolveReasoningTransport
};
