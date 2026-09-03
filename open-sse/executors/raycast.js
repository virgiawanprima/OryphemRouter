import { BaseExecutor } from "./base.js";

import { mergeUpstreamExtraHeaders } from "./executorUtils.js";

import { PROVIDERS } from "./executorConstants.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import {
  RAYCAST_CHAT_URL,
  buildRaycastChatBody,
  buildRaycastHeaders,
  parseRaycastSseText
} from "../utils/omni/raycast.js";
class RaycastExecutor extends BaseExecutor {
  constructor() {
    super("raycast", PROVIDERS.raycast);
  }
  buildUrl() {
    return RAYCAST_CHAT_URL;
  }
  // Not a BaseExecutor.buildHeaders override: Raycast signs headers over the exact
  // request payload (2nd param is the body string, not the base's `stream` boolean),
  // and execute() below is fully custom — keep it as a distinct helper so a
  // polymorphic buildHeaders(credentials, true) call can never land here.
  buildRaycastRequestHeaders(credentials, payload) {
    const body = payload || "{}";
    return buildRaycastHeaders(body, credentials);
  }
  async execute({ model, body, stream, credentials, signal, upstreamExtraHeaders }) {
    const reqBody = body;
    let payload;
    try {
      payload = buildRaycastChatBody(model, reqBody.messages || [], reqBody.temperature);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message: sanitizeErrorMessage(message),
              type: "invalid_request_error",
              code: ""
            }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: RAYCAST_CHAT_URL,
        headers: {},
        transformedBody: body
      };
    }
    let headers;
    try {
      headers = this.buildRaycastRequestHeaders(credentials, payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: new Response(
          JSON.stringify({
            error: { message: sanitizeErrorMessage(message), type: "invalid_request_error", code: "" }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: RAYCAST_CHAT_URL,
        headers: {},
        transformedBody: body
      };
    }
    mergeUpstreamExtraHeaders(headers, upstreamExtraHeaders);
    let raycastResponse;
    try {
      raycastResponse = await fetch(RAYCAST_CHAT_URL, {
        method: "POST",
        headers,
        body: payload,
        signal: signal || void 0
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: new Response(
          JSON.stringify({
            error: { message: sanitizeErrorMessage(message), type: "api_error", code: "" }
          }),
          { status: 502, headers: { "Content-Type": "application/json" } }
        ),
        url: RAYCAST_CHAT_URL,
        headers,
        transformedBody: payload
      };
    }
    if (!raycastResponse.ok) {
      const errorText = await raycastResponse.text();
      return {
        response: new Response(
          JSON.stringify({
            error: {
              message: sanitizeErrorMessage(`Raycast API error (${raycastResponse.status})`),
              type: "api_error",
              code: String(raycastResponse.status)
            }
          }),
          { status: raycastResponse.status, headers: { "Content-Type": "application/json" } }
        ),
        url: RAYCAST_CHAT_URL,
        headers,
        transformedBody: payload
      };
    }
    const responseId = `chatcmpl-raycast-${Date.now()}`;
    const created = Math.floor(Date.now() / 1e3);
    const modelId = model;
    if (stream !== false) {
      const raycastBody = raycastResponse.body;
      if (!raycastBody) {
        return {
          response: new Response(
            JSON.stringify({
              error: { message: "Raycast returned empty stream body", type: "api_error", code: "" }
            }),
            { status: 502, headers: { "Content-Type": "application/json" } }
          ),
          url: RAYCAST_CHAT_URL,
          headers,
          transformedBody: payload
        };
      }
      const sseStream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const reader = raycastBody.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              let newlineIndex;
              while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);
                if (!line.startsWith("data:")) continue;
                try {
                  const data = JSON.parse(line.slice(5).trim());
                  const hasContent = typeof data.text === "string" && data.text.length > 0;
                  const hasFinishReason = data.finish_reason !== void 0 && data.finish_reason !== null;
                  if (data.complete || !hasContent && !hasFinishReason) continue;
                  const chunk = {
                    id: responseId,
                    object: "chat.completion.chunk",
                    created,
                    model: modelId,
                    choices: [
                      {
                        index: 0,
                        delta: { content: data.text || "" },
                        finish_reason: hasFinishReason ? data.finish_reason : null
                      }
                    ]
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}

`));
                } catch {
                }
              }
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        }
      });
      return {
        response: new Response(sseStream, {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive"
          }
        }),
        url: RAYCAST_CHAT_URL,
        headers,
        transformedBody: payload
      };
    }
    const responseText = await raycastResponse.text();
    const content = parseRaycastSseText(responseText);
    return {
      response: new Response(
        JSON.stringify({
          id: responseId,
          object: "chat.completion",
          created,
          model: modelId,
          choices: [
            {
              index: 0,
              message: { role: "assistant", content, refusal: null },
              finish_reason: "stop"
            }
          ],
          usage: {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0
          }
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      ),
      url: RAYCAST_CHAT_URL,
      headers,
      transformedBody: payload
    };
  }
}
export {
  RaycastExecutor
};
