import { adapterFailureFromMessage, classifyError } from "./codexLibErrors.js";
import { encodeCompactionSummary } from "./codexResponsesCompaction.js";
import { encodeReasoningEnvelope } from "./codexResponsesReasoningEnvelope.js";
import { resolveStallTimeoutSec } from "./codexStallTimeout.js";
import { usageDisplayTotalTokens } from "./codexUsageTotals.js";
function uuid() {
  return crypto.randomUUID().replace(/-/g, "");
}
function sseEvent(name, data) {
  return `event: ${name}
data: ${JSON.stringify(data)}

`;
}
function responsesUsage(usage) {
  if (!usage) return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  const inputTokens = usage.inputTokens;
  const out = {
    input_tokens: inputTokens,
    output_tokens: usage.outputTokens,
    total_tokens: usageDisplayTotalTokens(usage) ?? inputTokens + usage.outputTokens
  };
  const inputDetails = {};
  if (usage.cachedInputTokens !== void 0) {
    inputDetails.cached_tokens = usage.cachedInputTokens;
  }
  if (usage.cacheCreationInputTokens !== void 0) {
    inputDetails.cache_write_tokens = usage.cacheCreationInputTokens;
  }
  if (Object.keys(inputDetails).length > 0) {
    out.input_tokens_details = inputDetails;
  }
  if (usage.reasoningOutputTokens !== void 0) {
    out.output_tokens_details = { reasoning_tokens: usage.reasoningOutputTokens };
  }
  return out;
}
function responseError(status, type, message) {
  return classifyError(status, type, message);
}
function adapterFailureFromEvent(event) {
  if (event.status === void 0 && event.errorType === void 0 && event.code === void 0) {
    return adapterFailureFromMessage(event.message);
  }
  const fallback = adapterFailureFromMessage(event.message);
  const httpStatus = event.status ?? fallback.httpStatus;
  const error = classifyError(httpStatus, event.errorType ?? fallback.error.type, event.message);
  if (event.errorType !== void 0) error.type = event.errorType;
  if (event.code !== void 0) error.code = event.code;
  return { httpStatus, error };
}
import { adapterFailureFromMessage as adapterFailureFromMessage2 } from "./codexLibErrors.js";
function webSearchAction(queries) {
  if (queries.length <= 1) return { type: "search", query: queries[0] ?? "" };
  return { type: "search", queries };
}
function bridgeToResponsesSSE(events, modelId, toolNsMap, freeformToolNames, toolSearchToolNames, onCancel, heartbeatMs = 2e3, options) {
  const freeformInput = (args) => {
    try {
      const o = JSON.parse(args);
      if (o && typeof o.input === "string") return o.input;
    } catch {
    }
    return args;
  };
  const FREEFORM_WRAP_PREFIX = '{"input":"';
  const freeformPartialInput = (args) => {
    if (!args.startsWith(FREEFORM_WRAP_PREFIX)) return args;
    const body = args.slice(FREEFORM_WRAP_PREFIX.length);
    let out = "";
    for (let i = 0; i < body.length; i++) {
      const c = body[i];
      if (c === '"') break;
      if (c === "\\") {
        const n = body[i + 1];
        if (n === void 0) break;
        i++;
        if (n === "n") out += "\n";
        else if (n === "t") out += "	";
        else if (n === "r") out += "\r";
        else if (n === "u") {
          const hex = body.slice(i + 1, i + 5);
          if (hex.length === 4 && /^[0-9a-fA-F]{4}$/.test(hex)) {
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
          } else break;
        } else out += n;
      } else out += c;
    }
    return out;
  };
  const parseArgsObj = (args) => {
    try {
      const o = JSON.parse(args);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  };
  const encoder = new TextEncoder();
  const responseId = options?.responseId ?? `resp_${uuid()}`;
  let seq = 0;
  let closed = false;
  let clientCancelled = false;
  let terminalReported = false;
  const reportTerminal = (status) => {
    if (terminalReported || clientCancelled || closed) return;
    terminalReported = true;
    options?.onTerminal?.(status);
  };
  let activity = false;
  let beat;
  let controller;
  let emittedFrames = 0;
  let gated = false;
  let stepping = false;
  const emit = (name, data) => {
    if (closed) return;
    activity = true;
    try {
      controller.enqueue(
        encoder.encode(sseEvent(name, { type: name, sequence_number: seq++, ...data }))
      );
      emittedFrames++;
    } catch {
      closed = true;
    }
  };
  const emitDone = () => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      emittedFrames++;
    } catch {
      closed = true;
    }
  };
  const createdAt = Math.floor(Date.now() / 1e3);
  let outputIndex = 0;
  const finishedItems = [];
  const responseSnapshot = (status, output, endTurn) => ({
    id: responseId,
    object: "response",
    created_at: createdAt,
    status,
    model: modelId,
    output,
    usage: null,
    ...endTurn !== void 0 ? { end_turn: endTurn } : {}
  });
  const heartbeatFrame = encoder.encode(
    'event: response.heartbeat\ndata: {"type":"response.heartbeat"}\n\n'
  );
  let stallTicks = 0;
  const stallSec = resolveStallTimeoutSec(options?.stallTimeoutSec);
  const maxStallTicks = Math.ceil(stallSec * 1e3 / heartbeatMs);
  let currentMsg = null;
  let currentReasoning = null;
  let currentRawReasoning = null;
  let pendingSignature;
  let pendingRedacted = [];
  let hiddenThinkingText = "";
  const takeReasoningEnvelope = (hiddenText) => {
    if (!pendingSignature && pendingRedacted.length === 0) return void 0;
    const envelope = {};
    if (pendingSignature) envelope.sig = pendingSignature;
    if (pendingRedacted.length > 0) envelope.red = pendingRedacted;
    if (hiddenText) envelope.txt = hiddenText;
    pendingSignature = void 0;
    pendingRedacted = [];
    return encodeReasoningEnvelope(envelope);
  };
  const flushHiddenReasoningEnvelope = () => {
    const encrypted = takeReasoningEnvelope(hiddenThinkingText || void 0);
    hiddenThinkingText = "";
    if (!encrypted) return;
    const itemId = `rs_${uuid()}`;
    const item = {
      type: "reasoning",
      id: itemId,
      summary: [],
      encrypted_content: encrypted
    };
    emit("response.output_item.added", { output_index: outputIndex, item });
    emit("response.output_item.done", { output_index: outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
  };
  let hiddenRawReasoningText = "";
  const flushHiddenRawReasoning = () => {
    if (!hiddenRawReasoningText) return;
    const encrypted = encodeReasoningEnvelope({ txt: hiddenRawReasoningText });
    hiddenRawReasoningText = "";
    const itemId = `rs_${uuid()}`;
    const item = {
      type: "reasoning",
      id: itemId,
      summary: [],
      encrypted_content: encrypted
    };
    emit("response.output_item.added", { output_index: outputIndex, item });
    emit("response.output_item.done", { output_index: outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
  };
  let compactionText = "";
  let currentToolCall = null;
  let currentWebSearch = null;
  let pendingWebSources = [];
  const takeWebAnnotations = () => {
    if (pendingWebSources.length === 0) return [];
    const anns = pendingWebSources.map((s) => ({
      type: "url_citation",
      url: s.url,
      ...s.title ? { title: s.title } : {},
      start_index: 0,
      end_index: 0
    }));
    pendingWebSources = [];
    return anns;
  };
  const closeCurrentMessage = () => {
    if (!currentMsg) return;
    const annotations = takeWebAnnotations();
    emit("response.output_text.done", {
      item_id: currentMsg.itemId,
      output_index: currentMsg.outputIndex,
      content_index: 0,
      text: currentMsg.text
    });
    emit("response.content_part.done", {
      item_id: currentMsg.itemId,
      output_index: currentMsg.outputIndex,
      content_index: 0,
      part: { type: "output_text", text: currentMsg.text, annotations }
    });
    const item = {
      type: "message",
      id: currentMsg.itemId,
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: currentMsg.text, annotations }],
      ...currentMsg.phase ? { phase: currentMsg.phase } : {}
    };
    emit("response.output_item.done", { output_index: currentMsg.outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
    currentMsg = null;
  };
  const closeCurrentReasoning = () => {
    if (!currentReasoning) return;
    emit("response.reasoning_summary_text.done", {
      item_id: currentReasoning.itemId,
      output_index: currentReasoning.outputIndex,
      summary_index: 0,
      text: currentReasoning.text
    });
    emit("response.reasoning_summary_part.done", {
      item_id: currentReasoning.itemId,
      output_index: currentReasoning.outputIndex,
      summary_index: 0,
      part: { type: "summary_text", text: currentReasoning.text }
    });
    const encrypted = takeReasoningEnvelope();
    const item = {
      type: "reasoning",
      id: currentReasoning.itemId,
      summary: [{ type: "summary_text", text: currentReasoning.text }],
      ...encrypted ? { encrypted_content: encrypted } : {}
    };
    emit("response.output_item.done", { output_index: currentReasoning.outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
    currentReasoning = null;
  };
  const closeCurrentRawReasoning = () => {
    if (!currentRawReasoning) return;
    const item = {
      type: "reasoning",
      id: currentRawReasoning.itemId,
      summary: [],
      content: [{ type: "reasoning_text", text: currentRawReasoning.text }]
    };
    emit("response.output_item.done", { output_index: currentRawReasoning.outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
    currentRawReasoning = null;
  };
  const closeCurrentToolCall = () => {
    if (!currentToolCall) return;
    const argsStr = currentToolCall.args || "{}";
    if (!currentToolCall.freeform && !currentToolCall.toolSearch) {
      emit("response.function_call_arguments.done", {
        item_id: currentToolCall.itemId,
        output_index: currentToolCall.outputIndex,
        arguments: argsStr
      });
    }
    if (currentToolCall.freeform) {
      emit("response.custom_tool_call_input.done", {
        item_id: currentToolCall.itemId,
        output_index: currentToolCall.outputIndex,
        input: freeformInput(currentToolCall.args)
      });
    }
    const item = currentToolCall.toolSearch ? {
      type: "tool_search_call",
      id: currentToolCall.itemId,
      call_id: currentToolCall.callId,
      execution: "client",
      arguments: parseArgsObj(currentToolCall.args),
      status: "completed"
    } : currentToolCall.freeform ? {
      type: "custom_tool_call",
      id: currentToolCall.itemId,
      call_id: currentToolCall.callId,
      name: currentToolCall.name,
      input: freeformInput(currentToolCall.args),
      status: "completed"
    } : {
      type: "function_call",
      id: currentToolCall.itemId,
      call_id: currentToolCall.callId,
      name: currentToolCall.name,
      arguments: argsStr,
      status: "completed",
      ...currentToolCall.namespace ? { namespace: currentToolCall.namespace } : {}
    };
    emit("response.output_item.done", { output_index: currentToolCall.outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
    currentToolCall = null;
  };
  const closeCurrentWebSearch = (status, queries, sources) => {
    if (!currentWebSearch) return;
    const item = {
      type: "web_search_call",
      id: currentWebSearch.itemId,
      status,
      action: webSearchAction(queries),
      ...sources && sources.length > 0 ? { sources } : {}
    };
    emit("response.output_item.done", { output_index: currentWebSearch.outputIndex, item });
    finishedItems.push(item);
    outputIndex++;
    currentWebSearch = null;
  };
  let terminated = false;
  let firstOutputReported = false;
  const reportFirstOutput = (event) => {
    if (firstOutputReported) return;
    const nonEmpty = event.type === "text_delta" ? event.text.length > 0 : event.type === "thinking_delta" ? event.thinking.length > 0 : event.type === "reasoning_raw_delta" ? event.text.length > 0 : false;
    if (!nonEmpty) return;
    firstOutputReported = true;
    try {
      options?.onFirstOutput?.();
    } catch {
    }
  };
  const it = events[Symbol.asyncIterator]();
  let iteratorStarted = false;
  let iteratorReturned = false;
  let upstreamDone = false;
  const returnIterator = () => {
    if (iteratorReturned) return;
    iteratorReturned = true;
    const finishReturn = () => {
      try {
        void it.return?.()?.catch(() => {
        });
      } catch {
      }
    };
    if (!iteratorStarted) {
      iteratorStarted = true;
      try {
        void it.next().then(finishReturn, () => {
        }).catch(() => {
        });
      } catch {
      }
      return;
    }
    finishReturn();
  };
  const step = async () => {
    if (stepping || closed) return;
    stepping = true;
    gated = false;
    const emittedAtStart = emittedFrames;
    try {
      while (!terminated && !closed && emittedFrames === emittedAtStart) {
        iteratorStarted = true;
        const next = await it.next();
        if (next.done) {
          upstreamDone = true;
          break;
        }
        const event = next.value;
        let terminalEvent = false;
        activity = true;
        stallTicks = 0;
        reportFirstOutput(event);
        if (options?.compaction) {
          if (event.type === "text_delta") {
            compactionText += event.text;
            continue;
          }
          if (event.type !== "done" && event.type !== "incomplete" && event.type !== "error")
            continue;
        }
        switch (event.type) {
          case "assistant_boundary": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            flushHiddenReasoningEnvelope();
            break;
          }
          case "text_delta": {
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (currentMsg && currentMsg.phase !== event.phase) closeCurrentMessage();
            if (!currentMsg) {
              const itemId = `msg_${uuid()}`;
              const item = {
                type: "message",
                id: itemId,
                status: "in_progress",
                role: "assistant",
                content: [],
                ...event.phase ? { phase: event.phase } : {}
              };
              emit("response.output_item.added", { output_index: outputIndex, item });
              emit("response.content_part.added", {
                item_id: itemId,
                output_index: outputIndex,
                content_index: 0,
                part: { type: "output_text", text: "", annotations: [] }
              });
              currentMsg = {
                itemId,
                outputIndex,
                text: "",
                ...event.phase ? { phase: event.phase } : {}
              };
            }
            currentMsg.text += event.text;
            emit("response.output_text.delta", {
              item_id: currentMsg.itemId,
              output_index: currentMsg.outputIndex,
              content_index: 0,
              delta: event.text
            });
            break;
          }
          case "thinking_delta": {
            if (options?.hideThinkingSummary) {
              hiddenThinkingText += event.thinking;
              break;
            }
            if (currentMsg) closeCurrentMessage();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (!currentReasoning) {
              const itemId = `rs_${uuid()}`;
              const item = {
                type: "reasoning",
                id: itemId,
                summary: []
              };
              emit("response.output_item.added", { output_index: outputIndex, item });
              emit("response.reasoning_summary_part.added", {
                item_id: itemId,
                output_index: outputIndex,
                summary_index: 0,
                part: { type: "summary_text", text: "" }
              });
              currentReasoning = { itemId, outputIndex, text: "" };
            }
            currentReasoning.text += event.thinking;
            emit("response.reasoning_summary_text.delta", {
              item_id: currentReasoning.itemId,
              output_index: currentReasoning.outputIndex,
              summary_index: 0,
              delta: event.thinking
            });
            break;
          }
          case "thinking_signature": {
            pendingSignature = event.signature;
            if (!currentReasoning) flushHiddenReasoningEnvelope();
            break;
          }
          case "redacted_thinking": {
            pendingRedacted.push(event.data);
            break;
          }
          case "reasoning_raw_delta": {
            if (options?.hideThinkingSummary) {
              hiddenRawReasoningText += event.text;
              break;
            }
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (!currentRawReasoning) {
              const itemId = `rs_${uuid()}`;
              const item = {
                type: "reasoning",
                id: itemId,
                summary: [],
                content: []
              };
              emit("response.output_item.added", { output_index: outputIndex, item });
              currentRawReasoning = { itemId, outputIndex, text: "" };
            }
            currentRawReasoning.text += event.text;
            emit("response.reasoning_text.delta", {
              item_id: currentRawReasoning.itemId,
              output_index: currentRawReasoning.outputIndex,
              content_index: 0,
              delta: event.text
            });
            break;
          }
          case "tool_call_start": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            const mapped = toolNsMap?.get(event.name);
            const realName = mapped?.name ?? event.name;
            const ns = mapped?.namespace;
            const toolSearch = toolSearchToolNames?.has(realName) ?? false;
            const freeform = !toolSearch && (freeformToolNames?.has(realName) ?? false);
            const itemId = `${toolSearch ? "tsc" : freeform ? "ctc" : "fc"}_${uuid()}`;
            const item = toolSearch ? {
              type: "tool_search_call",
              id: itemId,
              call_id: event.id,
              execution: "client",
              arguments: {},
              status: "in_progress"
            } : freeform ? {
              type: "custom_tool_call",
              id: itemId,
              call_id: event.id,
              name: realName,
              input: "",
              status: "in_progress"
            } : {
              type: "function_call",
              id: itemId,
              call_id: event.id,
              name: realName,
              arguments: "",
              status: "in_progress",
              ...ns ? { namespace: ns } : {}
            };
            emit("response.output_item.added", { output_index: outputIndex, item });
            currentToolCall = {
              itemId,
              outputIndex,
              callId: event.id,
              name: realName,
              args: "",
              namespace: ns,
              freeform,
              toolSearch
            };
            break;
          }
          case "tool_call_delta": {
            if (currentToolCall) {
              currentToolCall.args += event.arguments;
              if (!currentToolCall.freeform && !currentToolCall.toolSearch) {
                emit("response.function_call_arguments.delta", {
                  item_id: currentToolCall.itemId,
                  output_index: currentToolCall.outputIndex,
                  delta: event.arguments
                });
              }
              if (currentToolCall.freeform) {
                if (!FREEFORM_WRAP_PREFIX.startsWith(currentToolCall.args)) {
                  const full = freeformPartialInput(currentToolCall.args);
                  const emitted = currentToolCall.inputEmitted ?? "";
                  if (full.startsWith(emitted) && full.length > emitted.length) {
                    emit("response.custom_tool_call_input.delta", {
                      item_id: currentToolCall.itemId,
                      output_index: currentToolCall.outputIndex,
                      delta: full.slice(emitted.length)
                    });
                    currentToolCall.inputEmitted = full;
                  }
                }
              }
            }
            break;
          }
          case "tool_call_end": {
            closeCurrentToolCall();
            break;
          }
          case "web_search_call_begin": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (currentWebSearch) closeCurrentWebSearch("completed", []);
            const wsItemId = `ws_${uuid()}`;
            emit("response.output_item.added", {
              output_index: outputIndex,
              item: { type: "web_search_call", id: wsItemId, status: "in_progress" }
            });
            currentWebSearch = { itemId: wsItemId, eventId: event.id, outputIndex };
            break;
          }
          case "web_search_call_end": {
            if (!currentWebSearch || currentWebSearch.eventId !== event.id) {
              if (currentWebSearch) closeCurrentWebSearch("completed", []);
              const wsItemId2 = `ws_${uuid()}`;
              emit("response.output_item.added", {
                output_index: outputIndex,
                item: { type: "web_search_call", id: wsItemId2, status: "in_progress" }
              });
              currentWebSearch = { itemId: wsItemId2, eventId: event.id, outputIndex };
            }
            closeCurrentWebSearch(event.status ?? "completed", event.queries, event.sources);
            if (event.sources) {
              const seen = new Set(pendingWebSources.map((s) => s.url));
              for (const s of event.sources) {
                if (!seen.has(s.url)) {
                  seen.add(s.url);
                  pendingWebSources.push(s);
                }
              }
            }
            break;
          }
          case "done": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (currentWebSearch) closeCurrentWebSearch("completed", []);
            flushHiddenReasoningEnvelope();
            if (options?.compaction) {
              const item = {
                type: "compaction",
                id: `cmp_${uuid()}`,
                encrypted_content: encodeCompactionSummary(compactionText)
              };
              emit("response.output_item.done", { output_index: outputIndex, item });
              finishedItems.push(item);
              outputIndex++;
            }
            if (event.stopReason === "max_tokens" || event.stopReason === "content_filter") {
              const response = {
                ...responseSnapshot("incomplete", finishedItems, event.endTurn),
                usage: responsesUsage(event.usage),
                incomplete_details: {
                  reason: event.stopReason === "max_tokens" ? "max_output_tokens" : "content_filter"
                }
              };
              options?.onCompletedResponse?.(response, event.providerState);
              emit("response.incomplete", { response });
              reportTerminal("incomplete");
            } else {
              const response = {
                ...responseSnapshot("completed", finishedItems, event.endTurn),
                usage: responsesUsage(event.usage)
              };
              options?.onCompletedResponse?.(response, event.providerState);
              emit("response.completed", {
                response
              });
              reportTerminal("completed");
            }
            terminalEvent = true;
            break;
          }
          case "incomplete": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (currentWebSearch) closeCurrentWebSearch("failed", []);
            flushHiddenReasoningEnvelope();
            emit("response.incomplete", {
              response: {
                ...responseSnapshot("incomplete", finishedItems, event.endTurn),
                usage: responsesUsage(event.usage),
                incomplete_details: {
                  reason: event.reason,
                  ...event.message ? { message: event.message } : {},
                  ...event.retryable !== void 0 ? { retryable: event.retryable } : {}
                }
              }
            });
            reportTerminal("incomplete");
            terminalEvent = true;
            break;
          }
          case "error": {
            if (currentMsg) closeCurrentMessage();
            if (currentReasoning) closeCurrentReasoning();
            if (currentRawReasoning) closeCurrentRawReasoning();
            flushHiddenRawReasoning();
            if (currentToolCall) closeCurrentToolCall();
            if (currentWebSearch) closeCurrentWebSearch("failed", []);
            const failure = adapterFailureFromEvent(event);
            emit("response.failed", {
              response: {
                ...responseSnapshot("failed", finishedItems),
                // Partial consumption from a mid-stream upstream failure: surfaced so the request
                // log can record real tokens instead of usageStatus "unreported" with 0.
                ...event.usage ? { usage: responsesUsage(event.usage) } : {},
                error: failure.error,
                last_error: failure.error,
                ...event.retryable !== void 0 ? { retryable: event.retryable } : {}
              }
            });
            reportTerminal("failed");
            terminalEvent = true;
            break;
          }
        }
        if (terminalEvent) {
          onCancel?.();
          terminated = true;
          returnIterator();
          break;
        }
      }
    } catch (err) {
      if (!terminated) {
        flushHiddenRawReasoning();
        if (currentWebSearch) closeCurrentWebSearch("failed", []);
        emit("response.failed", {
          response: {
            ...responseSnapshot("failed", finishedItems),
            error: responseError(
              500,
              "proxy_error",
              err instanceof Error ? err.message : String(err)
            ),
            last_error: responseError(
              500,
              "proxy_error",
              err instanceof Error ? err.message : String(err)
            )
          }
        });
        reportTerminal("failed");
        onCancel?.();
        terminated = true;
        returnIterator();
      }
    }
    if (!terminated && !upstreamDone) {
      gated = true;
      stepping = false;
      return;
    }
    if (beat) {
      clearInterval(beat);
      beat = void 0;
    }
    if (!terminated) {
      if (currentMsg) closeCurrentMessage();
      if (currentReasoning) closeCurrentReasoning();
      if (currentRawReasoning) closeCurrentRawReasoning();
      flushHiddenRawReasoning();
      if (currentToolCall) closeCurrentToolCall();
      if (currentWebSearch) closeCurrentWebSearch("failed", []);
      emit("response.incomplete", {
        response: {
          ...responseSnapshot("incomplete", finishedItems),
          usage: responsesUsage(void 0),
          incomplete_details: { reason: "adapter_eof" }
        }
      });
      reportTerminal("incomplete");
      terminated = true;
    }
    emitDone();
    try {
      controller.close();
    } catch {
    }
    closed = true;
    gated = true;
    stepping = false;
  };
  const startStream = () => {
    emit("response.created", { response: responseSnapshot("in_progress", []) });
    gated = true;
    beat = setInterval(() => {
      if (closed || gated) return;
      if (activity) {
        activity = false;
        stallTicks = 0;
        return;
      }
      if (++stallTicks >= maxStallTicks) {
        if (currentMsg) closeCurrentMessage();
        if (currentReasoning) closeCurrentReasoning();
        if (currentRawReasoning) closeCurrentRawReasoning();
        flushHiddenRawReasoning();
        if (currentToolCall) closeCurrentToolCall();
        if (currentWebSearch) closeCurrentWebSearch("failed", []);
        emit("response.incomplete", {
          response: {
            ...responseSnapshot("incomplete", finishedItems),
            incomplete_details: { reason: "upstream_stall_timeout" }
          }
        });
        reportTerminal("incomplete");
        onCancel?.();
        terminated = true;
        returnIterator();
        emitDone();
        if (beat) clearInterval(beat);
        beat = void 0;
        try {
          controller.close();
        } catch {
        }
        closed = true;
        return;
      }
      try {
        controller.enqueue(heartbeatFrame);
        emittedFrames++;
      } catch {
        closed = true;
      }
    }, heartbeatMs);
  };
  return new ReadableStream({
    start(streamController) {
      controller = streamController;
      startStream();
    },
    pull() {
      return step();
    },
    cancel() {
      clientCancelled = true;
      closed = true;
      if (beat) clearInterval(beat);
      onCancel?.();
      returnIterator();
    }
  });
}
function buildResponseJSON(events, modelId, options) {
  const responseId = `resp_${uuid()}`;
  const output = [];
  let usage;
  let errorEvent;
  let incompleteEvent;
  let endTurn;
  let stopReason;
  let compactionText = "";
  let currentText = "";
  let currentTextPhase;
  let currentSummaryReasoning = "";
  let currentRawReasoning = "";
  let batchSignature;
  let batchRedacted = [];
  let currentToolCallId = "";
  let currentToolCallName = "";
  let currentToolCallArgs = "";
  let pendingWebSources = [];
  const freeformInput = (args) => {
    try {
      const o = JSON.parse(args);
      if (o && typeof o.input === "string") return o.input;
    } catch {
    }
    return args;
  };
  const parseArgsObj = (args) => {
    try {
      const o = JSON.parse(args);
      return o && typeof o === "object" ? o : {};
    } catch {
      return {};
    }
  };
  const flushText = () => {
    if (!currentText) return;
    const annotations = pendingWebSources.map((s) => ({
      type: "url_citation",
      url: s.url,
      ...s.title ? { title: s.title } : {},
      start_index: 0,
      end_index: 0
    }));
    pendingWebSources = [];
    output.push({
      type: "message",
      id: `msg_${uuid()}`,
      role: "assistant",
      status: "completed",
      content: [{ type: "output_text", text: currentText, annotations }],
      ...currentTextPhase ? { phase: currentTextPhase } : {}
    });
    currentText = "";
    currentTextPhase = void 0;
  };
  const flushSummaryReasoning = () => {
    if (!currentSummaryReasoning && !batchSignature && batchRedacted.length === 0) return;
    const envelope = {};
    if (batchSignature) envelope.sig = batchSignature;
    if (batchRedacted.length > 0) envelope.red = batchRedacted;
    const hidden = options?.hideThinkingSummary === true;
    if (hidden && currentSummaryReasoning && (envelope.sig || envelope.red))
      envelope.txt = currentSummaryReasoning;
    const encrypted = envelope.sig || envelope.red || envelope.txt ? encodeReasoningEnvelope(envelope) : void 0;
    batchSignature = void 0;
    batchRedacted = [];
    if (hidden && !encrypted) {
      currentSummaryReasoning = "";
      return;
    }
    output.push({
      type: "reasoning",
      id: `rs_${uuid()}`,
      summary: !hidden && currentSummaryReasoning ? [{ type: "summary_text", text: currentSummaryReasoning }] : [],
      ...encrypted ? { encrypted_content: encrypted } : {}
    });
    currentSummaryReasoning = "";
  };
  const flushRawReasoning = () => {
    if (!currentRawReasoning) return;
    if (options?.hideThinkingSummary === true) {
      output.push({
        type: "reasoning",
        id: `rs_${uuid()}`,
        summary: [],
        encrypted_content: encodeReasoningEnvelope({ txt: currentRawReasoning })
      });
      currentRawReasoning = "";
      return;
    }
    output.push({
      type: "reasoning",
      id: `rs_${uuid()}`,
      summary: [],
      content: [{ type: "reasoning_text", text: currentRawReasoning }]
    });
    currentRawReasoning = "";
  };
  const flushToolCall = () => {
    if (!currentToolCallId) return;
    const mapped = options?.toolNsMap?.get(currentToolCallName);
    const realName = mapped?.name ?? currentToolCallName;
    const ns = mapped?.namespace;
    const toolSearch = options?.toolSearchToolNames?.has(realName) ?? false;
    const freeform = !toolSearch && (options?.freeformToolNames?.has(realName) ?? false);
    if (toolSearch) {
      output.push({
        type: "tool_search_call",
        id: `tsc_${uuid()}`,
        call_id: currentToolCallId,
        execution: "client",
        arguments: parseArgsObj(currentToolCallArgs),
        status: "completed"
      });
    } else if (freeform) {
      output.push({
        type: "custom_tool_call",
        id: `ctc_${uuid()}`,
        call_id: currentToolCallId,
        name: realName,
        input: freeformInput(currentToolCallArgs),
        status: "completed"
      });
    } else {
      output.push({
        type: "function_call",
        id: `fc_${uuid()}`,
        call_id: currentToolCallId,
        name: realName,
        arguments: currentToolCallArgs || "{}",
        status: "completed",
        ...ns ? { namespace: ns } : {}
      });
    }
    currentToolCallId = "";
    currentToolCallName = "";
    currentToolCallArgs = "";
  };
  for (const e of events) {
    switch (e.type) {
      case "assistant_boundary":
        flushText();
        flushSummaryReasoning();
        flushRawReasoning();
        flushToolCall();
        break;
      case "text_delta":
        if (currentText && currentTextPhase !== e.phase) flushText();
        if (currentSummaryReasoning) flushSummaryReasoning();
        if (currentRawReasoning) flushRawReasoning();
        if (currentToolCallId) flushToolCall();
        if (options?.compaction) compactionText += e.text;
        else {
          currentTextPhase = e.phase;
          currentText += e.text;
        }
        break;
      case "thinking_delta":
        if (currentText) flushText();
        if (currentRawReasoning) flushRawReasoning();
        if (currentToolCallId) flushToolCall();
        currentSummaryReasoning += e.thinking;
        break;
      case "thinking_signature":
        batchSignature = e.signature;
        flushSummaryReasoning();
        break;
      case "redacted_thinking":
        batchRedacted.push(e.data);
        break;
      case "reasoning_raw_delta":
        if (currentText) flushText();
        if (currentSummaryReasoning) flushSummaryReasoning();
        if (currentToolCallId) flushToolCall();
        currentRawReasoning += e.text;
        break;
      case "tool_call_start":
        if (currentText) flushText();
        if (currentSummaryReasoning) flushSummaryReasoning();
        if (currentRawReasoning) flushRawReasoning();
        flushToolCall();
        currentToolCallId = e.id;
        currentToolCallName = e.name;
        currentToolCallArgs = "";
        break;
      case "tool_call_delta":
        currentToolCallArgs += e.arguments;
        break;
      case "tool_call_end":
        flushToolCall();
        break;
      case "web_search_call_begin":
        break;
      case "web_search_call_end":
        if (currentText) flushText();
        if (currentSummaryReasoning) flushSummaryReasoning();
        if (currentRawReasoning) flushRawReasoning();
        flushToolCall();
        output.push({
          type: "web_search_call",
          id: `ws_${uuid()}`,
          status: e.status ?? "completed",
          action: webSearchAction(e.queries),
          ...e.sources && e.sources.length > 0 ? { sources: e.sources } : {}
        });
        if (e.sources) {
          const seen = new Set(pendingWebSources.map((s) => s.url));
          for (const s of e.sources) {
            if (!seen.has(s.url)) {
              seen.add(s.url);
              pendingWebSources.push(s);
            }
          }
        }
        break;
      case "error":
        errorEvent = e;
        usage = e.usage ?? usage;
        break;
      case "incomplete":
        incompleteEvent = e;
        endTurn = e.endTurn;
        if (e.providerState) options?.onProviderState?.(e.providerState);
        break;
      case "done":
        usage = e.usage;
        endTurn = e.endTurn;
        if (e.providerState) options?.onProviderState?.(e.providerState);
        if (e.stopReason === "max_tokens") stopReason = "max_tokens";
        break;
    }
  }
  flushText();
  flushSummaryReasoning();
  flushRawReasoning();
  flushToolCall();
  if (options?.compaction && !errorEvent && !incompleteEvent && stopReason !== "max_tokens") {
    output.push({
      type: "compaction",
      id: `cmp_${uuid()}`,
      encrypted_content: encodeCompactionSummary(compactionText)
    });
  }
  const failure = errorEvent ? adapterFailureFromEvent(errorEvent) : void 0;
  const status = errorEvent ? "failed" : incompleteEvent || stopReason === "max_tokens" ? "incomplete" : "completed";
  return {
    id: responseId,
    object: "response",
    created_at: Math.floor(Date.now() / 1e3),
    status,
    model: modelId,
    output,
    ...endTurn !== void 0 ? { end_turn: endTurn } : {},
    ...failure ? { error: failure.error, last_error: failure.error } : {},
    ...errorEvent?.retryable !== void 0 ? { retryable: errorEvent.retryable } : {},
    ...incompleteEvent ? {
      incomplete_details: {
        reason: incompleteEvent.reason,
        ...incompleteEvent.message ? { message: incompleteEvent.message } : {},
        ...incompleteEvent.retryable !== void 0 ? { retryable: incompleteEvent.retryable } : {}
      }
    } : stopReason === "max_tokens" ? {
      incomplete_details: { reason: "max_output_tokens" }
    } : {},
    usage: responsesUsage(incompleteEvent?.usage ?? usage)
  };
}
function formatErrorResponse(status, type, message) {
  return new Response(JSON.stringify({ error: classifyError(status, type, message) }), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
export {
  adapterFailureFromMessage2 as adapterFailureFromMessage,
  bridgeToResponsesSSE,
  buildResponseJSON,
  formatErrorResponse
};
