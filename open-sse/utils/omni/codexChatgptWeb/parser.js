// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) native Responses
// request parser. The full parser is not ported; this minimal version extracts
// the few fields the executor reads so request routing/validation still works.

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

/**
 * Minimal parse of a native Codex /v1/responses request. Extracts tool choice,
 * tools, compaction flag and keeps the raw body for identity extraction.
 */
export function parseRequest(body) {
  const b = record(body) || {};
  const options = {
    toolChoice: b.tool_choice ?? null,
    hideThinkingSummary:
      record(b.reasoning)?.hide_summary === true || record(b.text)?.format === "json_schema",
  };
  const context = {
    tools: Array.isArray(b.tools) ? b.tools : [],
  };
  return {
    options,
    context,
    _rawBody: body,
    _compactionRequest: undefined,
  };
}
