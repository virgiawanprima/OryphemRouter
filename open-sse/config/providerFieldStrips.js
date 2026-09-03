const KNOWN_OFFENDING_FIELDS = [
  "reasoning_budget",
  "chat_template",
  "reasoning_content",
  "context_management",
  // GPT-5's Chat Completions-only output control. It can be present when a
  // routing rule substitutes a non-GPT OpenAI-compatible target (for example
  // Codex → GLM or Ollama Cloud), whose strict endpoint rejects it as an extra
  // field. Retrying without it is safe because it only changes output style.
  "verbosity"
];
function findOffendingField(bodyText) {
  if (typeof bodyText !== "string" || !bodyText) return null;
  for (const field of KNOWN_OFFENDING_FIELDS) {
    if (bodyText.includes(field)) return field;
  }
  return null;
}
const UNSUPPORTED_PARAM_RE = /unsupported\s+parameter\w*(?:\s*\(s\))?[:\s]+["'`]?(\w+)["'`]?/i;
function detectUnsupportedParam(bodyText) {
  if (typeof bodyText !== "string" || !bodyText) return null;
  const match = UNSUPPORTED_PARAM_RE.exec(bodyText);
  return match?.[1] ?? null;
}
function stripGroqUnsupportedFields(body) {
  if (!body || typeof body !== "object") return body;
  const next = { ...body };
  delete next.logprobs;
  delete next.logit_bias;
  delete next.top_logprobs;
  if (Array.isArray(next.messages)) {
    next.messages = next.messages.map((m) => {
      if (m && typeof m === "object") {
        const {
          name: _name,
          model: _model,
          messageId: _msgId,
          sender: _sender,
          ...rest
        } = m;
        return rest;
      }
      return m;
    });
  }
  return next;
}
export {
  KNOWN_OFFENDING_FIELDS,
  UNSUPPORTED_PARAM_RE,
  detectUnsupportedParam,
  findOffendingField,
  stripGroqUnsupportedFields
};
