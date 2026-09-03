import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { isCloudflareChallenge } from "../../services/lmarenaTlsClient.js";
import { markLMArenaCatalogModelDead } from "./models.js";
import { parseArenaSSE } from "./stream.js";
const encoder = new TextEncoder();
function errorResponse(status, message, type, code) {
  return new Response(
    JSON.stringify({
      error: { message: sanitizeErrorMessage(message), type, code }
    }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
function missingCookieResult(url, headers, transformedBody) {
  return {
    response: errorResponse(
      401,
      "Arena requires a session cookie. Paste the full Cookie header from arena.ai (include arena-auth-prod-v1.* chunks and ideally cf_clearance).",
      "authentication_error",
      "missing_cookie"
    ),
    url,
    headers,
    transformedBody
  };
}
function parseArenaErrorBody(text, status) {
  const fallback = `Arena API error: ${status}`;
  if (!text) return fallback;
  try {
    const errorJson = JSON.parse(text);
    return errorJson.error?.message || errorJson.message || fallback;
  } catch {
    return text.slice(0, 500) || fallback;
  }
}
function isBotOrChallenge(status, text) {
  if (status === 403) return true;
  if (isCloudflareChallenge(text)) return true;
  return Boolean(text && text.trimStart().startsWith("<!DOCTYPE"));
}
function botBlockMessage(text, hasRecaptcha, status) {
  if (isCloudflareChallenge(text)) {
    return "Arena blocked by Cloudflare bot management. Use a residential/browser-grade network if needed, paste a fresh full Cookie header (include cf_clearance / __cf_bm when present), and optionally set providerSpecificData.recaptchaV3Token from a live browser session.";
  }
  if (hasRecaptcha) return `Arena API error: ${status}`;
  return `Arena API error: ${status}. If this persists, supply a browser reCAPTCHA v3 token via credentials.providerSpecificData.recaptchaV3Token (in addition to the session cookie).`;
}
function mapFailedTlsResult(opts) {
  const { status, text, hasRecaptcha, model, arenaModelId, url, headers, transformedBody } = opts;
  if (isBotOrChallenge(status, text)) {
    return {
      response: errorResponse(
        status || 403,
        botBlockMessage(text, hasRecaptcha, status),
        "api_error",
        "cloudflare_or_bot"
      ),
      url,
      headers,
      transformedBody
    };
  }
  if (status >= 200 && status < 300) return null;
  if (status === 404 || status === 410 || status === 502) {
    markLMArenaCatalogModelDead(model);
    markLMArenaCatalogModelDead(arenaModelId);
  }
  return {
    response: errorResponse(status, parseArenaErrorBody(text, status), "api_error", String(status)),
    url,
    headers,
    transformedBody
  };
}
function mapTlsUnavailable(error, url, headers, transformedBody) {
  return {
    response: errorResponse(
      502,
      `Arena TLS impersonation unavailable: ${error.message}. Install/repair tls-client-node native binary.`,
      "upstream_error",
      "TLS_CLIENT_UNAVAILABLE"
    ),
    url,
    headers,
    transformedBody
  };
}
function mapNetworkError(message, url, headers, transformedBody) {
  return {
    response: errorResponse(502, message, "network_error", "request_failed"),
    url,
    headers,
    transformedBody
  };
}
function buildArenaUpstreamHttpResponse(opts) {
  const { stream, status, text, body } = opts;
  if (stream && body) {
    return new Response(body, {
      status,
      headers: { "Content-Type": "text/event-stream" }
    });
  }
  return new Response(text ?? "", {
    status,
    headers: { "Content-Type": "text/event-stream" }
  });
}
function baseChunk(model) {
  return {
    id: `chatcmpl-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model
  };
}
function enqueueSse(controller, chunk) {
  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}

`));
}
function emitStopAndDone(controller, model) {
  enqueueSse(controller, {
    ...baseChunk(model),
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }]
  });
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  controller.close();
}
function handleArenaEventLine(sseLine, model, controller) {
  const event = parseArenaSSE(sseLine);
  if (!event) return false;
  if (event.type === "text" && event.content) {
    enqueueSse(controller, {
      ...baseChunk(model),
      choices: [{ index: 0, delta: { content: event.content }, finish_reason: null }]
    });
    return false;
  }
  if (event.type === "error") {
    enqueueSse(controller, {
      ...baseChunk(model),
      choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
      error: { message: sanitizeErrorMessage(event.content || "Unknown error") }
    });
    controller.close();
    return true;
  }
  if (event.type === "done") {
    emitStopAndDone(controller, model);
    return true;
  }
  return false;
}
function createOpenAIArenaStream(opts) {
  const { reader, model, signal, log } = opts;
  const decoder = new TextDecoder();
  let buffer = "";
  const onAbort = () => {
    void reader.cancel().catch(() => void 0);
  };
  if (signal) {
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          if (signal?.aborted) {
            await reader.cancel().catch(() => void 0);
            controller.close();
            return;
          }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const sseLine = line.startsWith("data: ") ? line.substring(6) : line;
            if (handleArenaEventLine(sseLine, model, controller)) return;
          }
        }
        emitStopAndDone(controller, model);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log?.error?.("LMArenaExecutor", `Streaming error: ${message}`);
        controller.error(error);
      } finally {
        if (signal) signal.removeEventListener("abort", onAbort);
      }
    },
    cancel() {
      void reader.cancel().catch(() => void 0);
      if (signal) signal.removeEventListener("abort", onAbort);
    }
  });
}
async function handleNonStreamingArenaResponse(response, model) {
  const text = await response.text();
  let fullText = "";
  let error = null;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const sseLine = line.startsWith("data: ") ? line.substring(6) : line;
    const event = parseArenaSSE(sseLine);
    if (!event) continue;
    if (event.type === "text" && event.content) fullText += event.content;
    else if (event.type === "error") {
      error = event.content || "Unknown error";
      break;
    } else if (event.type === "done") break;
  }
  if (error) return errorResponse(502, error, "api_error", "lmarena_error");
  return new Response(
    JSON.stringify({
      id: `chatcmpl-${Date.now()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1e3),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: fullText },
          finish_reason: "stop"
        }
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}
export {
  buildArenaUpstreamHttpResponse,
  createOpenAIArenaStream,
  errorResponse,
  handleNonStreamingArenaResponse,
  mapFailedTlsResult,
  mapNetworkError,
  mapTlsUnavailable,
  missingCookieResult
};
