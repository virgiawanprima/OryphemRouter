import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
function readFrameError(frame) {
  const data = frame.data ?? {};
  const raw = frame.error ?? data.error;
  if (!raw) return null;
  if (typeof raw === "string") return sanitizeErrorMessage(raw) || "upstream error";
  if (typeof raw === "object") {
    const rec = raw;
    const message = rec.detail ?? rec.message ?? rec.msg;
    if (typeof message === "string" && message) return sanitizeErrorMessage(message);
    return sanitizeErrorMessage(JSON.stringify(raw));
  }
  return sanitizeErrorMessage(String(raw));
}
function parseOpenAiShapedFrame(choices) {
  const delta = choices[0]?.delta ?? {};
  const finishReason = choices[0]?.finish_reason;
  return {
    content: typeof delta.content === "string" ? delta.content : "",
    reasoning: typeof delta.reasoning_content === "string" ? delta.reasoning_content : "",
    done: finishReason != null
  };
}
function parseInternalEnvelopeFrame(frame, data) {
  const phase = String(data.phase ?? "");
  const deltaContent = data.delta_content ?? data.edit_content ?? data.content;
  const done = data.done === true || phase === "done" || phase === "finish" || String(frame.type ?? "") === "chat:completion:finish";
  if (typeof deltaContent === "string" && deltaContent) {
    const isThinking = phase === "thinking";
    return {
      content: isThinking ? "" : deltaContent,
      reasoning: isThinking ? deltaContent : "",
      done
    };
  }
  if (done) return { content: "", reasoning: "", done: true };
  return null;
}
function parseZaiFrame(raw) {
  if (!raw || typeof raw !== "object") return null;
  const frame = raw;
  const error = readFrameError(frame);
  if (error) return { content: "", reasoning: "", done: true, error };
  const choices = frame.choices;
  if (Array.isArray(choices) && choices.length > 0) {
    return parseOpenAiShapedFrame(choices);
  }
  const data = frame.data ?? frame;
  return parseInternalEnvelopeFrame(frame, data);
}
function extractSseDataPayloads(buffer, incoming) {
  buffer.text += incoming;
  const lines = buffer.text.split("\n");
  buffer.text = lines.pop() || "";
  const payloads = [];
  for (const line of lines) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    payloads.push(data);
  }
  return payloads;
}
function parseSsePayload(data) {
  try {
    return parseZaiFrame(JSON.parse(data));
  } catch {
    return null;
  }
}
async function drainSseDeltas(sourceBody, onDelta) {
  const decoder = new TextDecoder();
  const reader = sourceBody.getReader();
  const buffer = { text: "" };
  while (true) {
    const { done, value } = await reader.read();
    if (done) return false;
    const payloads = extractSseDataPayloads(buffer, decoder.decode(value, { stream: true }));
    for (const raw of payloads) {
      const delta = parseSsePayload(raw);
      if (delta && onDelta(delta)) return true;
    }
  }
}
function emitDeltaChunks(controller, delta, emitChunk, roleState) {
  if (!roleState.emitted && (delta.content || delta.reasoning || delta.error)) {
    roleState.emitted = true;
    emitChunk(controller, { role: "assistant", content: "" });
  }
  if (delta.reasoning) emitChunk(controller, { reasoning_content: delta.reasoning });
  if (delta.content) emitChunk(controller, { content: delta.content });
  if (delta.error) emitChunk(controller, { content: `[Z.ai error] ${delta.error}` });
  if (delta.done) {
    emitChunk(controller, {}, "stop");
    controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    controller.close();
    return true;
  }
  return false;
}
function buildZaiStreamingBody(sourceBody, emitChunk, signal) {
  return new ReadableStream({
    async start(controller) {
      const roleState = { emitted: false };
      try {
        const ended = await drainSseDeltas(
          sourceBody,
          (delta) => emitDeltaChunks(controller, delta, emitChunk, roleState)
        );
        if (ended) return;
        if (!roleState.emitted) emitChunk(controller, { role: "assistant", content: "" });
        emitChunk(controller, {}, "stop");
        controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error) {
        if (!signal?.aborted) {
          try {
            controller.error(error);
          } catch {
          }
        }
      }
    }
  });
}
async function collectZaiNonStreaming(sourceBody) {
  let answer = "";
  let reasoning = "";
  await drainSseDeltas(sourceBody, (delta) => {
    if (delta.error) throw new Error(delta.error);
    if (delta.reasoning) reasoning += delta.reasoning;
    if (delta.content) answer += delta.content;
    return delta.done;
  });
  return { answer, reasoning };
}
function makeZaiChunkEmitter(id, created, modelId) {
  return (controller, delta, finish = null) => {
    const chunk = {
      id,
      object: "chat.completion.chunk",
      created,
      model: modelId,
      choices: [{ index: 0, delta, finish_reason: finish }]
    };
    controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}

`));
  };
}
export {
  buildZaiStreamingBody,
  collectZaiNonStreaming,
  makeZaiChunkEmitter,
  parseZaiFrame
};
