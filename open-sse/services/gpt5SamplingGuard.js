import { FORMATS } from "../translator/formats.js";
const SAMPLING_PARAMS = ["temperature", "top_p"];
const ACTIVE_EFFORT_SUFFIX = /-(low|medium|high|xhigh|minimal)$/i;
const NONE_EFFORT_SUFFIX = /-none$/i;
function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
function hasActiveReasoning(record, model) {
  const effort = record.reasoning_effort;
  if (typeof effort === "string") return effort.toLowerCase() !== "none";
  const reasoning = asRecord(record.reasoning);
  if (reasoning && typeof reasoning.effort === "string") {
    return reasoning.effort.toLowerCase() !== "none";
  }
  if (NONE_EFFORT_SUFFIX.test(model)) return false;
  if (ACTIVE_EFFORT_SUFFIX.test(model)) return true;
  return false;
}
function stripGpt5SamplingWhenReasoning(body, provider, model, log) {
  if (provider !== "openai") return body;
  if (typeof model !== "string" || !/^gpt-5/i.test(model)) return body;
  const record = asRecord(body);
  if (!record) return body;
  if (!hasActiveReasoning(record, model)) return body;
  const stripped = [];
  for (const param of SAMPLING_PARAMS) {
    if (Object.hasOwn(record, param)) stripped.push(param);
  }
  if (stripped.length === 0) return body;
  const next = { ...record };
  for (const param of stripped) delete next[param];
  log?.warn?.(
    "PARAMS",
    `Stripped ${stripped.join(", ")} for reasoning-active ${model} (GPT-5 rejects sampling params unless reasoning_effort=none)`
  );
  return next;
}
const REASONING_FIELDS = ["reasoning_effort", "reasoning"];
function hasFunctionTools(record) {
  if (!Array.isArray(record.tools) || record.tools.length === 0) return false;
  return record.tools.some((toolValue) => {
    const tool = asRecord(toolValue);
    if (!tool) return false;
    const toolType = typeof tool.type === "string" ? tool.type : "";
    return toolType === "" || toolType === "function";
  });
}
function stripGpt5ReasoningWhenTools(body, provider, model, targetFormat, log) {
  if (provider !== "openai") return body;
  if (typeof model !== "string" || !/^gpt-5/i.test(model)) return body;
  if (targetFormat === FORMATS.OPENAI_RESPONSES) return body;
  const record = asRecord(body);
  if (!record) return body;
  if (!hasFunctionTools(record)) return body;
  if (!hasActiveReasoning(record, model)) return body;
  const stripped = [];
  for (const field of REASONING_FIELDS) {
    if (Object.hasOwn(record, field)) stripped.push(field);
  }
  if (stripped.length === 0) return body;
  const next = { ...record };
  for (const field of stripped) delete next[field];
  log?.warn?.(
    "PARAMS",
    `Stripped ${stripped.join(", ")} for ${model} (function tools + reasoning_effort are rejected on /v1/chat/completions; use /v1/responses instead)`
  );
  return next;
}
export {
  stripGpt5ReasoningWhenTools,
  stripGpt5SamplingWhenReasoning
};
