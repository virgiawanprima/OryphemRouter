import { withBodyTimeout as defaultWithBodyTimeout } from "../../utils/omni/streamExtras.js";
import { synthesizeOpenAiSseFromJson as defaultSynthesize } from "../../utils/jsonToSse.js";
const DEFAULT_DEPS = {
  withBodyTimeout: defaultWithBodyTimeout,
  synthesizeOpenAiSseFromJson: defaultSynthesize
};
function prependBufferedChunks(chunks, reader) {
  let index = 0;
  return new ReadableStream({
    async pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index++]);
        return;
      }
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
        } else {
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } catch {
      }
    }
  });
}
function classifyBodyPrefix(text) {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  if (!trimmed) return "unknown";
  if (trimmed.startsWith(":")) return "sse";
  if (/^(?:data|event|id|retry)\s*:/i.test(trimmed)) return "sse";
  const lower = trimmed.toLowerCase();
  for (const field of ["data", "event", "id", "retry"]) {
    if (field.startsWith(lower)) return "unknown";
    if (lower.startsWith(field)) {
      const rest = lower.slice(field.length);
      if (/^\s*$/.test(rest)) return "unknown";
      if (/^\s*:/.test(rest)) return "sse";
    }
  }
  return "non-sse";
}
async function sniffJsonBodyForSse(providerResponse, ctx, deps) {
  const reader = providerResponse.body.getReader();
  const bufferedChunks = [];
  const decoder = new TextDecoder();
  let sniffed = "";
  let sniffedBytes = 0;
  const maxSniffBytes = 4096;
  while (sniffedBytes < maxSniffBytes) {
    const chunk = await deps.withBodyTimeout(reader.read());
    if (chunk.done || !chunk.value) break;
    bufferedChunks.push(chunk.value);
    sniffedBytes += chunk.value.byteLength;
    sniffed += decoder.decode(chunk.value, { stream: true });
    if (classifyBodyPrefix(sniffed) === "sse") {
      const rebuiltHeaders = new Headers(providerResponse.headers);
      rebuiltHeaders.delete("content-length");
      rebuiltHeaders.set("content-type", "text/event-stream");
      ctx.log?.debug?.(
        "STREAM",
        `Upstream returned SSE bytes with application/json content-type \u2014 preserving streaming body (${ctx.provider}/${ctx.model})`
      );
      return {
        sseResponse: new Response(prependBufferedChunks(bufferedChunks, reader), {
          status: providerResponse.status,
          statusText: providerResponse.statusText,
          headers: rebuiltHeaders
        }),
        jsonBody: new Response(null)
      };
    }
  }
  return { jsonBody: new Response(prependBufferedChunks(bufferedChunks, reader)) };
}
async function maybeConvertJsonBodyToSse(providerResponse, ctx, deps = DEFAULT_DEPS) {
  const upstreamContentType = (providerResponse.headers.get("content-type") || "").toLowerCase();
  const isNonSseJsonBody = !!providerResponse.body && upstreamContentType.includes("application/json") && !upstreamContentType.includes("text/event-stream") && !upstreamContentType.includes("application/x-ndjson");
  if (!isNonSseJsonBody) {
    return providerResponse;
  }
  const { sseResponse, jsonBody } = await sniffJsonBodyForSse(providerResponse, ctx, deps);
  if (sseResponse) return sseResponse;
  const jsonText = await deps.withBodyTimeout(jsonBody.text());
  const synthesizedSse = deps.synthesizeOpenAiSseFromJson(jsonText);
  const rebuiltHeaders = new Headers(providerResponse.headers);
  rebuiltHeaders.delete("content-length");
  if (synthesizedSse) {
    ctx.log?.debug?.(
      "STREAM",
      `Upstream returned application/json on a streaming request \u2014 converting to SSE (${ctx.provider}/${ctx.model})`
    );
    rebuiltHeaders.set("content-type", "text/event-stream");
    return new Response(synthesizedSse, {
      status: providerResponse.status,
      statusText: providerResponse.statusText,
      headers: rebuiltHeaders
    });
  }
  return new Response(jsonText, {
    status: providerResponse.status,
    statusText: providerResponse.statusText,
    headers: rebuiltHeaders
  });
}
export {
  maybeConvertJsonBodyToSse
};
