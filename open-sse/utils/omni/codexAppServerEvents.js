const CODEX_APPSERVER_METHODS = {
  agentMessageDelta: "item/agentMessage/delta",
  reasoningTextDelta: "item/reasoning/textDelta",
  reasoningSummaryTextDelta: "item/reasoning/summaryTextDelta",
  turnCompleted: "turn/completed",
  error: "error"
};
const CODEX_APPSERVER_TOOL_CALL_METHOD = "item/tool/call";
function dynamicToolWireName(namespace, tool) {
  const name = typeof tool === "string" ? tool : "";
  return typeof namespace === "string" && namespace.length > 0 ? `${namespace}__${name}` : name;
}
function translateToolCall(params, push) {
  const callId = typeof params.callId === "string" && params.callId.length > 0 ? params.callId : `call_${Math.random().toString(36).slice(2)}`;
  const name = dynamicToolWireName(params.namespace, params.tool);
  let argsStr = "{}";
  const rawArgs = params.arguments;
  if (typeof rawArgs === "string") {
    argsStr = rawArgs.length > 0 ? rawArgs : "{}";
  } else if (rawArgs !== void 0 && rawArgs !== null) {
    try {
      argsStr = JSON.stringify(rawArgs);
    } catch {
      argsStr = "{}";
    }
  }
  push({ type: "tool_call_start", id: callId, name });
  if (argsStr.length > 0) push({ type: "tool_call_delta", arguments: argsStr });
  push({ type: "tool_call_end" });
}
function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function mapUsage(raw) {
  if (!raw || typeof raw !== "object") return void 0;
  const u = raw;
  const inputTokens = num(u.input_tokens) ?? 0;
  const outputTokens = num(u.output_tokens) ?? 0;
  const usage = { inputTokens, outputTokens };
  const cached = num(u.cached_input_tokens);
  if (cached !== void 0) {
    usage.cachedInputTokens = cached;
    usage.cacheReadInputTokens = cached;
  }
  const reasoning = num(u.reasoning_output_tokens);
  if (reasoning !== void 0) usage.reasoningOutputTokens = reasoning;
  const total = num(u.total_tokens);
  if (total !== void 0) usage.totalTokens = total;
  return usage;
}
function extractTurnUsage(params) {
  const turn = params.turn;
  if (turn && typeof turn === "object") {
    const t = turn;
    return mapUsage(t.usage) ?? mapUsage(t.tokenUsage) ?? mapUsage(t.token_usage);
  }
  return mapUsage(params.usage);
}
function errorMessage(params) {
  const err = params.error;
  if (err && typeof err === "object") {
    const m = err.message;
    if (typeof m === "string" && m.length > 0) return m;
  }
  if (typeof params.message === "string" && params.message.length > 0) return params.message;
  return "Codex app-server reported an error";
}
function translateNotification(method, params, push) {
  const p = params && typeof params === "object" ? params : {};
  switch (method) {
    case CODEX_APPSERVER_METHODS.agentMessageDelta: {
      const delta = p.delta;
      if (typeof delta === "string" && delta.length > 0) {
        push({ type: "text_delta", text: delta });
      }
      return false;
    }
    case CODEX_APPSERVER_METHODS.reasoningTextDelta:
    case CODEX_APPSERVER_METHODS.reasoningSummaryTextDelta: {
      const delta = p.delta;
      if (typeof delta === "string" && delta.length > 0) {
        push({ type: "thinking_delta", thinking: delta });
      }
      return false;
    }
    case CODEX_APPSERVER_METHODS.turnCompleted: {
      push({ type: "done", usage: extractTurnUsage(p), endTurn: true });
      return true;
    }
    case CODEX_APPSERVER_METHODS.error: {
      push({
        type: "error",
        message: errorMessage(p),
        status: 502,
        errorType: "provider_error",
        code: "codex_app_server_turn_failed"
      });
      return true;
    }
    default:
      return false;
  }
}
export {
  CODEX_APPSERVER_METHODS,
  CODEX_APPSERVER_TOOL_CALL_METHOD,
  dynamicToolWireName,
  mapUsage,
  translateNotification,
  translateToolCall
};
