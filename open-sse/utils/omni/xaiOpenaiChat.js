// Minimal self-contained adaptation of OmniRoute
// src/lib/providers/xai/translators/openai-chat.ts for OryphemRouter.
// Implements chatRequestToXaiResponses (OpenAI Chat Completions → xAI
// Responses) plus the reasoning-effort normalizer it depends on.

const VALID_EFFORTS = new Set(["minimal", "low", "medium", "high"]);

export function normalizeXaiReasoningEffort(effort) {
  if (typeof effort !== "string") return undefined;
  const normalized = effort.toLowerCase();
  if (normalized === "max" || normalized === "xhigh") return "high";
  return VALID_EFFORTS.has(normalized) ? normalized : undefined;
}

function messageContentToXaiBlocks(content) {
  if (typeof content === "string") {
    return [{ type: "input_text", text: content }];
  }
  if (!Array.isArray(content)) return [];
  return content
    .map((p) => {
      if (!p || typeof p !== "object") return null;
      if (p.type === "text") return { type: "input_text", text: p.text ?? "" };
      if (p.type === "image_url") return { type: "input_image", image_url: p.image_url };
      if (p.type === "input_audio") return { type: "input_audio", input_audio: p.input_audio };
      return p; // passthrough unknown
    })
    .filter((b) => b !== null);
}

function toolsPassthrough(tools) {
  if (!Array.isArray(tools)) return undefined;
  return tools.map((t) => ({ ...t }));
}

/**
 * Translate an inbound OpenAI Chat Completions request body into an xAI Responses body.
 */
export function chatRequestToXaiResponses(req) {
  if (!req || typeof req !== "object") return req;
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const instructionsParts = [];
  const input = [];

  for (const m of messages) {
    if (!m) continue;
    if (m.role === "system" || m.role === "developer") {
      const txt =
        typeof m.content === "string"
          ? m.content
          : Array.isArray(m.content)
            ? m.content.map((p) => p?.text ?? "").filter(Boolean).join("\n")
            : "";
      if (txt) instructionsParts.push(txt);
      continue;
    }
    if (m.role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: m.tool_call_id,
        output: typeof m.content === "string" ? m.content : JSON.stringify(m.content ?? ""),
      });
      continue;
    }
    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      if (m.content) {
        input.push({ role: "assistant", content: messageContentToXaiBlocks(m.content) });
      }
      for (const tc of m.tool_calls) {
        if (tc.type !== "function" || !tc.function) continue;
        input.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.function.name,
          arguments: tc.function.arguments ?? "",
        });
      }
      continue;
    }
    input.push({ role: m.role ?? "user", content: messageContentToXaiBlocks(m.content ?? "") });
  }

  const out = { model: req.model, input };
  if (instructionsParts.length) out.instructions = instructionsParts.join("\n\n");

  if (req.temperature != null) out.temperature = req.temperature;
  if (req.top_p != null) out.top_p = req.top_p;
  if (req.max_tokens != null) out.max_output_tokens = req.max_tokens;
  if (req.max_output_tokens != null) out.max_output_tokens = req.max_output_tokens;
  if (req.stop != null) out.stop = req.stop;
  if (req.user) out.user = req.user;
  if (req.metadata) out.metadata = req.metadata;
  if (req.response_format) out.text = { format: req.response_format };
  if (req.parallel_tool_calls != null) out.parallel_tool_calls = req.parallel_tool_calls;
  if (req.seed != null) out.seed = req.seed;
  if (req.reasoning_effort) {
    const effort = normalizeXaiReasoningEffort(req.reasoning_effort);
    if (effort) out.reasoning = { effort };
  }
  if (req.reasoning && typeof req.reasoning === "object") {
    const reasoning = req.reasoning;
    const effort = normalizeXaiReasoningEffort(reasoning.effort);
    out.reasoning = effort ? { ...reasoning, effort } : reasoning;
  }
  if (req.tool_choice) out.tool_choice = req.tool_choice;

  const tools = req.tools ? toolsPassthrough(req.tools) : undefined;
  if (tools) out.tools = tools;
  return out;
}
