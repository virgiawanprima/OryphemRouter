import { buildToolAwareResult } from "../translator/webTools.js";
const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  "X-Accel-Buffering": "no"
};
function sseChunk(data) {
  return `data: ${JSON.stringify(data)}

`;
}
async function applyToolCallsToJsonResponse(response, requestedTools, idSeed) {
  const bodyText = await response.text();
  try {
    const json = JSON.parse(bodyText);
    const rawContent = json?.choices?.[0]?.message?.content || "";
    const { content, toolCalls, finishReason } = buildToolAwareResult(
      rawContent,
      requestedTools,
      idSeed
    );
    if (toolCalls) {
      json.choices[0].message = { role: "assistant", content: null, tool_calls: toolCalls };
      json.choices[0].finish_reason = finishReason;
    } else {
      json.choices[0].message.content = content;
    }
    return new Response(JSON.stringify(json), {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch {
    return new Response(bodyText, {
      status: response.status,
      headers: { "Content-Type": "application/json" }
    });
  }
}
function toolCompletionToSseStream(completion, cid, created, model) {
  const encoder = new TextEncoder();
  const choice = completion?.choices?.[0] ?? {};
  const message = choice.message ?? {};
  const finishReason = choice.finish_reason ?? "stop";
  const chunk = (delta, fr) => encoder.encode(
    sseChunk({
      id: cid,
      object: "chat.completion.chunk",
      created,
      model,
      system_fingerprint: null,
      choices: [{ index: 0, delta, finish_reason: fr, logprobs: null }]
    })
  );
  return new ReadableStream({
    start(controller) {
      controller.enqueue(chunk({ role: "assistant" }, null));
      const delta = message.tool_calls ? { tool_calls: message.tool_calls } : { content: message.content ?? "" };
      controller.enqueue(chunk(delta, finishReason));
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    }
  });
}
async function buildToolModeResponse(bufferedJson, requestedTools, stream, meta) {
  const jsonResponse = await applyToolCallsToJsonResponse(
    bufferedJson,
    requestedTools,
    meta.idSeed ?? "cgpt"
  );
  if (!stream) return jsonResponse;
  const completion = await jsonResponse.json();
  return new Response(toolCompletionToSseStream(completion, meta.cid, meta.created, meta.model), {
    status: 200,
    headers: SSE_HEADERS
  });
}
export {
  buildToolModeResponse
};
