// Minimal self-contained adaptation of OmniRoute handlers/responseTranslator.ts
// for OryphemRouter. Only the non-streaming response translation used by
// glm.js is ported: converting an Anthropic Messages (Claude-format) response
// body into an OpenAI chat.completion body. Other format pairs fall back to
// passthrough.

export const FORMATS = {
  OPENAI: "openai",
  CLAUDE: "claude",
  OPENAI_RESPONSES: "openai-responses",
  GEMINI: "gemini",
};

function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}

function claudeFinishToOpenAI(stopReason) {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "tool_use":
      return "tool_calls";
    case "max_tokens":
    case "length":
      return "length";
    default:
      return "stop";
  }
}

/** Anthropic Messages response -> OpenAI chat.completion (non-streaming). */
function claudeResponseToOpenAI(body) {
  const root = toRecord(body);
  const content = Array.isArray(root.content) ? root.content : [];
  let text = "";
  const reasoning = [];
  const toolCalls = [];

  for (const block of content) {
    const b = asRecord(block);
    if (!b) continue;
    if (b.type === "text" && typeof b.text === "string") text += b.text;
    else if (b.type === "thinking" && typeof b.thinking === "string") reasoning.push(b.thinking);
    else if (b.type === "redacted_thinking") reasoning.push("[redacted thinking]");
    else if (b.type === "tool_use") {
      toolCalls.push({
        id: typeof b.id === "string" ? b.id : `call_${Date.now()}_${toolCalls.length}`,
        type: "function",
        function: {
          name: typeof b.name === "string" ? b.name : "",
          arguments: b.input != null ? JSON.stringify(b.input) : "{}",
        },
      });
    }
  }

  const message = { role: "assistant" };
  if (text) message.content = text;
  else message.content = toolCalls.length ? null : "";
  if (reasoning.length) message.reasoning_content = reasoning.join("");
  if (toolCalls.length) message.tool_calls = toolCalls;

  const usage = toRecord(root.usage);
  const result = {
    id: typeof root.id === "string" ? root.id : `chatcmpl-${Date.now()}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: typeof root.model === "string" ? root.model : null,
    choices: [
      {
        index: 0,
        message,
        finish_reason: claudeFinishToOpenAI(root.stop_reason),
      },
    ],
  };

  if (Object.keys(usage).length > 0) {
    result.usage = {
      prompt_tokens: typeof usage.input_tokens === "number" ? usage.input_tokens : 0,
      completion_tokens: typeof usage.output_tokens === "number" ? usage.output_tokens : 0,
      total_tokens:
        (typeof usage.input_tokens === "number" ? usage.input_tokens : 0) +
        (typeof usage.output_tokens === "number" ? usage.output_tokens : 0),
    };
  }
  return result;
}

/**
 * Translate a non-streaming response body between formats.
 *
 * OryphemRouter port: mirrors OmniRoute's semantics where `targetFormat`
 * selects which input shape is parsed into an OpenAI intermediate. glm.js
 * always calls this with (body, FORMATS.CLAUDE, FORMATS.OPENAI) — i.e. parse
 * a Claude-format body into OpenAI chat.completion. Everything else falls back
 * to passthrough.
 */
export function translateNonStreamingResponse(responseBody, targetFormat, sourceFormat) {
  if (targetFormat === sourceFormat) return responseBody;
  if (targetFormat === FORMATS.CLAUDE && sourceFormat !== FORMATS.CLAUDE) {
    return claudeResponseToOpenAI(responseBody);
  }
  return responseBody;
}
