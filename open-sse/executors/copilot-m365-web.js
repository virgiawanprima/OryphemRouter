import WebSocket from "ws";
import { FETCH_TIMEOUT_MS } from "./executorConstants.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { BaseExecutor } from "./base.js";
import {
  buildPrompt,
  buildRouterPrompt,
  buildWsUrl,
  currentM365AccessToken,
  currentM365ChathubPath,
  decodeJwtClaims,
  extractToolSpec,
  flattenMessages,
  redactWsUrl,
  refreshM365AccessToken,
  resolveConnectionParams,
  tokenNeedsRefresh
} from "./copilot-m365-connection.js";
import {
  accumulateBotContent,
  buildChatInvocation,
  clientPlugins,
  encodeFrame,
  extractCompletionError,
  extractFinalResultMessage,
  handshakeError,
  handshakeFrame,
  isCompletionFrame,
  isUpdateFrame,
  keepaliveFrame,
  metricsFrame,
  parseFencedToolCalls,
  parseFrame,
  parseToolRouterDecision,
  resolveChatInvocationOverrides,
  resolveToneForModel,
  splitFrames
} from "./copilot-m365-frames.js";
let WebSocketCtor = WebSocket;
function __setCopilotM365WebSocketForTesting(ctor) {
  const previous = WebSocketCtor;
  WebSocketCtor = ctor;
  return () => {
    WebSocketCtor = previous;
  };
}
function sseChunk(model, delta, finishReason = null) {
  return `data: ${JSON.stringify({
    id: `chatcmpl-copilot-m365-${Date.now()}`,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1e3),
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }]
  })}

`;
}
function describeUpdateFrameShape(frame) {
  if (!isUpdateFrame(frame) || !frame) return null;
  const args = frame.arguments;
  const first = Array.isArray(args) ? args[0] : void 0;
  if (!first) return null;
  return Object.keys(first).join(",");
}
function errorResponse(message, status = 502) {
  return new Response(JSON.stringify({ error: { message } }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
async function readSseText(stream) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const parsed = JSON.parse(data);
        const choices = parsed.choices;
        const choice = Array.isArray(choices) ? choices[0] : void 0;
        if (typeof choice?.delta?.content === "string") fullText += choice.delta.content;
      } catch {
      }
    }
  }
  return fullText;
}
function toolCallsResult(calls, opts) {
  if (opts.stream) {
    let sse = sseChunk(opts.model, { role: "assistant", content: null });
    for (let i = 0; i < calls.length; i++) {
      sse += sseChunk(opts.model, {
        tool_calls: [
          {
            index: i,
            id: calls[i].id,
            type: calls[i].type,
            function: { name: calls[i].name, arguments: calls[i].arguments }
          }
        ]
      });
    }
    sse += sseChunk(opts.model, {}, "tool_calls") + "data: [DONE]\n\n";
    return {
      response: new Response(sse, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive"
        }
      }),
      url: redactWsUrl(opts.wsUrl),
      headers: {},
      transformedBody: { model: opts.model, toolCalls: calls.length }
    };
  }
  return {
    response: new Response(
      JSON.stringify({
        id: `chatcmpl-copilot-m365-${Date.now()}`,
        object: "chat.completion",
        created: Math.floor(Date.now() / 1e3),
        model: opts.model,
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: null,
              tool_calls: calls.map((c) => ({
                id: c.id,
                type: c.type,
                function: { name: c.name, arguments: c.arguments }
              }))
            },
            finish_reason: "tool_calls"
          }
        ],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
      }),
      { headers: { "Content-Type": "application/json" } }
    ),
    url: redactWsUrl(opts.wsUrl),
    headers: {},
    transformedBody: { model: opts.model, toolCalls: calls.length }
  };
}
class CopilotM365WebExecutor extends BaseExecutor {
  constructor() {
    super("copilot-m365-web", { id: "copilot-m365-web", baseUrl: "wss://substrate.office.com" });
  }
  async wsChat(input) {
    const log = input.log ?? null;
    const toolMode = (input.tools?.length ?? 0) > 0;
    return new ReadableStream(
      {
        start: async (controller) => {
          const encoder = new TextEncoder();
          let ws = null;
          let settled = false;
          let buffer = "";
          let previousText = "";
          let pendingTail = "";
          let fenceSeen = false;
          let finalResultMessage = "";
          let handshakeComplete = false;
          const cleanup = () => {
            if (ws) {
              try {
                ws.close();
              } catch {
              }
              ws = null;
            }
          };
          const finish = () => {
            if (settled) return;
            settled = true;
            cleanup();
            if (!previousText && finalResultMessage) {
              previousText = finalResultMessage;
            }
            const calls = toolMode ? parseFencedToolCalls(previousText, input.tools ?? [], input.toolChoice) : [];
            if (calls.length > 0) {
              controller.enqueue(
                encoder.encode(sseChunk(input.model, { role: "assistant", content: null }))
              );
              for (let i = 0; i < calls.length; i++) {
                const call = calls[i];
                controller.enqueue(
                  encoder.encode(
                    sseChunk(input.model, {
                      tool_calls: [
                        {
                          index: i,
                          id: call.id,
                          type: call.type,
                          function: { name: call.name, arguments: call.arguments }
                        }
                      ]
                    })
                  )
                );
              }
              controller.enqueue(encoder.encode(sseChunk(input.model, {}, "tool_calls")));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              return;
            }
            if (!previousText) {
              const tierNote = input.tier ? `resolved tier: ${input.tier}` : "resolved tier: individual (default)";
              const message = sanitizeErrorMessage(
                `Microsoft 365 Copilot turn completed with no content in any known frame shape (${tierNote}). Possible causes: an unrecognized frame shape for this tenant, or a misconfigured tier.`
              );
              controller.enqueue(
                encoder.encode(`data: ${JSON.stringify({ error: { message } })}

`)
              );
              controller.close();
              return;
            }
            if (pendingTail) {
              controller.enqueue(encoder.encode(sseChunk(input.model, { content: pendingTail })));
              pendingTail = "";
            }
            controller.enqueue(encoder.encode(sseChunk(input.model, {}, "stop")));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          };
          const abort = (reason) => {
            if (settled) return;
            settled = true;
            cleanup();
            const message = sanitizeErrorMessage(reason);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: { message } })}

`)
            );
            controller.close();
          };
          input.signal?.addEventListener("abort", () => abort("Request aborted"), { once: true });
          const timeout = setTimeout(
            () => abort("Microsoft 365 Copilot WebSocket timeout"),
            FETCH_TIMEOUT_MS
          );
          try {
            const wsUrlParts = new URL(input.wsUrl);
            const requestId = wsUrlParts.searchParams.get("chatsessionid") ?? wsUrlParts.searchParams.get("clientrequestid") ?? crypto.randomUUID();
            const sessionId = wsUrlParts.searchParams.get("X-SessionId") ?? crypto.randomUUID();
            const conversationId = wsUrlParts.searchParams.get("ConversationId") ?? crypto.randomUUID();
            const traceId = crypto.randomUUID();
            log?.debug?.("M365_WS", `connecting \u2192 ${redactWsUrl(input.wsUrl)}`);
            ws = new WebSocketCtor(input.wsUrl, {
              headers: {
                Origin: "https://m365.cloud.microsoft",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
              }
            });
            const sendChat = () => {
              const overrides = resolveChatInvocationOverrides(input.tier);
              const tone = resolveToneForModel(input.model) ?? overrides.tone;
              const invocationFrame = encodeFrame(
                buildChatInvocation({
                  text: input.prompt,
                  traceId,
                  sessionId,
                  requestId,
                  conversationId,
                  isStartOfSession: true,
                  ...overrides,
                  tone,
                  // Declare the client's tools natively too (plugins + toolChoice +
                  // a customInstructions nudge); the fenced-block protocol in the
                  // prompt remains the parseable path.
                  ...toolMode ? {
                    plugins: clientPlugins(input.tools ?? []),
                    toolChoice: input.toolChoice ?? null,
                    customInstructions: "You have access to real tools provided by the calling application. Call tools directly when needed. Do not say tools are unavailable."
                  } : {}
                })
              );
              ws?.send(invocationFrame + metricsFrame());
            };
            ws.on("open", () => {
              log?.debug?.("M365_WS", "socket open \u2014 sending handshake");
              ws?.send(handshakeFrame());
            });
            ws.on("message", (data) => {
              if (settled) return;
              buffer += data.toString();
              const split = splitFrames(buffer);
              buffer = split.rest;
              for (const rawFrame of split.frames) {
                const frame = parseFrame(rawFrame);
                log?.debug?.(
                  "M365_WS",
                  `frame type=${String(frame?.type)} target=${String(frame?.target)}`
                );
                if (!handshakeComplete) {
                  const err = handshakeError(frame);
                  if (err) {
                    clearTimeout(timeout);
                    log?.debug?.("M365_WS", `handshake failed: ${err}`);
                    abort(`Microsoft 365 Copilot handshake failed: ${err}`);
                    return;
                  }
                  handshakeComplete = true;
                  log?.debug?.("M365_WS", "handshake complete \u2014 sending chat invocation");
                  sendChat();
                  continue;
                }
                if (frame?.type === 6) {
                  try {
                    ws?.send(keepaliveFrame());
                  } catch {
                  }
                  continue;
                }
                const { delta, next } = accumulateBotContent(previousText, frame);
                if (!delta && next === previousText) {
                  const shape = describeUpdateFrameShape(frame);
                  if (shape) log?.debug?.("M365_WS", `unrecognized update frame keys: ${shape}`);
                }
                previousText = next;
                if (delta) {
                  if (!toolMode) {
                    controller.enqueue(encoder.encode(sseChunk(input.model, { content: delta })));
                  } else if (!fenceSeen) {
                    pendingTail += delta;
                    if (pendingTail.includes("```")) {
                      fenceSeen = true;
                    } else if (pendingTail.length > 12) {
                      const cut = pendingTail.length - 12;
                      controller.enqueue(
                        encoder.encode(
                          sseChunk(input.model, { content: pendingTail.slice(0, cut) })
                        )
                      );
                      pendingTail = pendingTail.slice(cut);
                    }
                  }
                }
                const finalMsg = extractFinalResultMessage(frame);
                if (finalMsg) {
                  finalResultMessage = finalMsg;
                }
                const completionError = extractCompletionError(frame);
                if (completionError) {
                  clearTimeout(timeout);
                  log?.debug?.("M365_WS", `completion error: ${completionError}`);
                  abort(`Microsoft 365 Copilot invocation failed: ${completionError}`);
                  return;
                }
                if (isCompletionFrame(frame)) {
                  clearTimeout(timeout);
                  finish();
                  return;
                }
              }
            });
            ws.on("error", (err) => {
              clearTimeout(timeout);
              log?.debug?.(
                "M365_WS",
                `socket error: ${err instanceof Error ? err.message : String(err)}`
              );
              abort(
                sanitizeErrorMessage(
                  err instanceof Error ? err.message : "Microsoft 365 Copilot WebSocket error"
                )
              );
            });
            ws.on("close", () => {
              clearTimeout(timeout);
              finish();
            });
          } catch (err) {
            clearTimeout(timeout);
            abort(
              sanitizeErrorMessage(
                err instanceof Error ? err.message : "Failed to connect to Microsoft 365 Copilot"
              )
            );
          }
        }
      },
      { highWaterMark: 16384 }
    );
  }
  /**
   * #10718 — proactively refresh the M365 access token before opening the WS.
   * A WS-handshake 401 surfaces as an error event INSIDE the SSE stream (the HTTP
   * response is already 200 by then), so chatCore's generic 401→refresh→retry
   * orchestration never triggers — the refresh has to happen here, pre-flight.
   * No-ops for legacy connections without a stored refresh_token.
   */
  async ensureFreshCredentials(credentials, onCredentialsRefreshed, log) {
    const psd = credentials?.providerSpecificData ?? {};
    const refreshToken = credentials.refreshToken || (typeof psd.refreshToken === "string" ? psd.refreshToken : "");
    if (!refreshToken) return;
    const current = currentM365AccessToken(credentials);
    if (current && !tokenNeedsRefresh(current)) return;
    const tid = decodeJwtClaims(current)?.tid || (typeof psd.tid === "string" ? psd.tid : "") || "";
    const result = await refreshM365AccessToken(refreshToken, tid, log ?? void 0);
    if ("error" in result) {
      return;
    }
    const rotated = result.refreshToken || refreshToken;
    const chathubPath = currentM365ChathubPath(credentials);
    const assembledApiKey = chathubPath ? ["access_token=", result.accessToken, "; chathubPath=", chathubPath].join("") : "";
    const next = {
      ...credentials,
      accessToken: result.accessToken,
      refreshToken: rotated,
      // Keep the pasted-format apiKey self-consistent so every resolution path
      // (fresh column, stale column, dashboard re-read) sees the same token.
      ...assembledApiKey ? { apiKey: assembledApiKey } : {},
      ...result.expiresIn ? { expiresAt: new Date(Date.now() + result.expiresIn * 1e3).toISOString() } : {}
    };
    Object.assign(credentials, next);
    try {
      await onCredentialsRefreshed?.(next);
    } catch (err) {
      log?.warn?.(
        "M365_TOKEN",
        `persisting refreshed token failed (${err instanceof Error ? err.message : String(err)}) \u2014 will re-refresh next request`
      );
    }
  }
  async execute(input) {
    const body = input.body;
    const model = input.model || body?.model || "copilot-m365";
    const stream = input.stream !== false;
    const { tools, toolChoice } = extractToolSpec(body);
    const routerActive = tools.length > 0 && toolChoice !== "none";
    const flat = flattenMessages(body);
    const prompt = (routerActive ? "Please answer the following request in full, using the tool results already provided in the conversation. Do not output tool-routing decisions.\n\n" + flat : buildPrompt(body)).trim();
    if (!prompt) {
      return {
        response: errorResponse("No user message provided", 400),
        url: "wss://substrate.office.com/m365Copilot/Chathub",
        headers: {},
        transformedBody: null
      };
    }
    await this.ensureFreshCredentials(
      input.credentials,
      input.onCredentialsRefreshed,
      input.log ?? null
    );
    const connectionParams = resolveConnectionParams(input.credentials);
    if ("error" in connectionParams) {
      return {
        response: errorResponse(connectionParams.error, 400),
        url: "wss://substrate.office.com/m365Copilot/Chathub",
        headers: {},
        transformedBody: { model, prompt: prompt.slice(0, 100) }
      };
    }
    const wsUrl = buildWsUrl(connectionParams);
    let answerWsUrl = null;
    try {
      if (routerActive) {
        const routerStream = await this.wsChat({
          wsUrl,
          prompt: buildRouterPrompt(flat, tools, toolChoice),
          model,
          tier: connectionParams.tier,
          signal: input.signal ?? void 0,
          log: input.log
        });
        const routerText = await readSseText(routerStream);
        const decision = parseToolRouterDecision(routerText, tools, toolChoice);
        input.log?.debug?.(
          "M365_TOOLS",
          `router decided=${decision.decided} calls=${decision.calls.length}`
        );
        if (decision.decided && decision.calls.length > 0) {
          return toolCallsResult(decision.calls, { stream, model, wsUrl });
        }
        answerWsUrl = buildWsUrl(connectionParams);
      }
      const wsStream = await this.wsChat({
        wsUrl: answerWsUrl ?? wsUrl,
        prompt,
        model,
        tier: connectionParams.tier,
        tools,
        toolChoice,
        signal: input.signal ?? void 0,
        log: input.log
      });
      if (stream) {
        return {
          response: new Response(wsStream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive"
            }
          }),
          url: redactWsUrl(wsUrl),
          headers: {},
          transformedBody: { model, prompt: prompt.slice(0, 100) }
        };
      }
      const reader = wsStream.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      const toolCalls = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const line of decoder.decode(value, { stream: true }).split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            const choice = parsed.choices?.[0];
            const content = choice?.delta?.content;
            if (typeof content === "string") fullText += content;
            for (const tc of choice?.delta?.tool_calls ?? []) {
              toolCalls.push({
                id: String(tc.id ?? ""),
                type: String(tc.type ?? "function"),
                name: String(tc.function?.name ?? ""),
                arguments: String(tc.function?.arguments ?? "{}")
              });
            }
          } catch {
          }
        }
      }
      if (toolCalls.length > 0) {
        const fenceIndex = fullText.indexOf("```");
        const content = fenceIndex > 0 ? fullText.slice(0, fenceIndex).trim() : null;
        return {
          response: new Response(
            JSON.stringify({
              id: `chatcmpl-copilot-m365-${Date.now()}`,
              object: "chat.completion",
              created: Math.floor(Date.now() / 1e3),
              model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content,
                    tool_calls: toolCalls.map((c) => ({
                      id: c.id,
                      type: c.type,
                      function: { name: c.name, arguments: c.arguments }
                    }))
                  },
                  finish_reason: "tool_calls"
                }
              ],
              usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            }),
            { headers: { "Content-Type": "application/json" } }
          ),
          url: redactWsUrl(answerWsUrl ?? wsUrl),
          headers: {},
          transformedBody: { model, toolCalls: toolCalls.length }
        };
      }
      return {
        response: new Response(
          JSON.stringify({
            id: `chatcmpl-copilot-m365-${Date.now()}`,
            object: "chat.completion",
            created: Math.floor(Date.now() / 1e3),
            model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: fullText || "(empty response)" },
                finish_reason: "stop"
              }
            ],
            usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
          }),
          { headers: { "Content-Type": "application/json" } }
        ),
        url: redactWsUrl(wsUrl),
        headers: {},
        transformedBody: { model, prompt: prompt.slice(0, 100) }
      };
    } catch (err) {
      const message = sanitizeErrorMessage(
        err instanceof Error ? err.message : "Microsoft 365 Copilot executor error"
      );
      return {
        response: errorResponse(message),
        url: redactWsUrl(wsUrl),
        headers: {},
        transformedBody: { model, prompt: prompt.slice(0, 100) }
      };
    }
  }
}
export {
  CopilotM365WebExecutor,
  __setCopilotM365WebSocketForTesting
};
