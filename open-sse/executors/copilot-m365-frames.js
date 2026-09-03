const RECORD_SEPARATOR = String.fromCharCode(30);
const HANDSHAKE_REQUEST = { protocol: "json", version: 1 };
const KEEPALIVE_PING = { type: 6 };
const ALLOWED_MESSAGE_TYPES = [
  "Chat",
  "Suggestion",
  "InternalSearchQuery",
  "Disengaged",
  "InternalLoaderMessage",
  "Progress",
  "GeneratedCode",
  "RenderCardRequest",
  "AdsQuery",
  "SemanticSerp",
  "GenerateContentQuery",
  "GenerateGraphicArt",
  "SearchQuery",
  "ConfirmationCard",
  "AuthError",
  "DeveloperLogs",
  "TriggerPlugin",
  "HintInvocation",
  "MemoryUpdate",
  "EndOfRequest",
  "TriggerConfirmation",
  "ResumeInvokeAction",
  "ResumeUserInputRequest",
  "TriggerUserInputRequest",
  "EscapeHatch",
  "TriggerPluginAuth",
  "ResumePluginAuth",
  "SideBySide",
  "ReferencesListComplete",
  "SwitchRespondingEndpoint"
];
const M365_ENTERPRISE_OPTION_SETS = [
  "enterprise_flux_image",
  "enterprise_flux_web",
  "enterprise_flux_work",
  "enterprise_toolbox_with_skdsstore",
  "enterprise_pagination_support",
  "enterprise_flux_work_code_interpreter",
  "enterprise_code_interpreter_citation_fix",
  "bizchat_enable_federated_connectors",
  "at_mention_plugins_enable"
];
const M365_ENTERPRISE_EXTRA_MESSAGE_TYPES = [
  "ReferencesListComplete",
  "EndOfRequest",
  "MemoryUpdate",
  "TriggerPlugin",
  "AuthError",
  "SwitchRespondingEndpoint"
];
const M365_DEFAULT_OPTION_SETS = [
  "search_result_progress_messages_with_search_queries",
  "update_textdoc_response_after_streaming",
  "deepleo_networking_timeout_10minutes_canmore",
  "cwc_flux_image",
  "cwc_code_interpreter",
  "cwc_code_interpreter_amsfix",
  "cwcfluxgptv",
  "flux_v3_gptv_enable_upload_multi_image_in_turn_wo_ch",
  "gptvnorm2048",
  "cwc_code_interpreter_citation_fix",
  "code_interpreter_interactive_charts",
  "cwc_code_interpreter_interactive_charts_inline_image",
  "code_interpreter_matplotlib_patching",
  "cwc_fileupload_odb",
  "update_memory_plugin",
  "add_custom_instructions",
  "cwc_flux_v3",
  "flux_v3_progress_messages",
  "enable_batch_token_processing",
  "enable_gg_gpt",
  "async_client_interaction",
  "flux_v3_references",
  "flux_v3_references_entities",
  "flux_v3_references_ci",
  "add_filestore_filetype",
  "cwc_code_interpreter_citation_sourceannotations",
  "cdxcwc_code_interpreter_hallucinated_url_filter",
  "flux_v3_image_gen_enable_dimensions",
  "flux_v3_image_gen_enable_non_watermarked_storage",
  "flux_v3_image_gen_enable_icon_dimensions",
  "flux_v3_image_gen_enable_system_text_with_params",
  "flux_v3_image_gen_enable_designer_dimensions_meta_prompting_in_system_prompts",
  "flux_v3_image_gen_enable_story",
  "rich_responses"
];
function encodeFrame(obj) {
  return JSON.stringify(obj) + RECORD_SEPARATOR;
}
function handshakeFrame() {
  return encodeFrame(HANDSHAKE_REQUEST);
}
function keepaliveFrame() {
  return encodeFrame(KEEPALIVE_PING);
}
const CHAT_METRICS_FRAME = {
  arguments: [
    {
      Timestamps: {
        ConnectionEstablished: "",
        ConnectionStart: "",
        UserInputStart: "",
        UserInputSubmit: ""
      }
    }
  ],
  target: "Metrics",
  type: 1
};
function metricsFrame() {
  return encodeFrame(CHAT_METRICS_FRAME);
}
function splitFrames(buffer) {
  const parts = buffer.split(RECORD_SEPARATOR);
  const rest = parts.pop() ?? "";
  const frames = parts.filter((p) => p.length > 0);
  return { frames, rest };
}
function parseFrame(frame) {
  const trimmed = frame.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
function handshakeError(frame) {
  if (!frame) return null;
  const err = frame.error;
  return typeof err === "string" && err.length > 0 ? err : null;
}
function clientPlugins(tools) {
  return tools.map((t) => ({
    Id: t.name,
    Source: "API",
    Description: t.description,
    Parameters: t.parameters ?? {}
  }));
}
function toolChoiceAllows(toolChoice, name) {
  if (toolChoice == null || toolChoice === "auto" || toolChoice === "required") return true;
  if (typeof toolChoice === "string") return toolChoice === name;
  const fn = toolChoice?.function;
  return typeof fn?.name === "string" && fn.name === name;
}
const SHELL_TOOL_NAMES = ["bash", "sh", "shell", "powershell", "cmd"];
const FENCED_BLOCK = /```([A-Za-z0-9_-]+)[ \t]*\r?\n([\s\S]*?)\r?\n```/g;
function parseFencedToolCalls(text, tools, toolChoice) {
  const allowed = new Set(tools.map((t) => t.name));
  const declaredShell = SHELL_TOOL_NAMES.find((n) => allowed.has(n));
  const out = [];
  for (const m of text.matchAll(FENCED_BLOCK)) {
    const name = m[1];
    const body = m[2].trim();
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      parsed = void 0;
    }
    if (SHELL_TOOL_NAMES.includes(name)) {
      const target = allowed.has(name) ? name : declaredShell;
      if (!target) continue;
      const args = parsed && typeof parsed === "object" && "command" in parsed ? parsed : { command: body };
      out.push({
        id: `call_${crypto.randomUUID()}`,
        type: "function",
        name: target,
        arguments: JSON.stringify(args)
      });
      continue;
    }
    if (!allowed.has(name) || !toolChoiceAllows(toolChoice, name)) continue;
    if (parsed == null || typeof parsed !== "object") continue;
    out.push({
      id: `call_${crypto.randomUUID()}`,
      type: "function",
      name,
      arguments: JSON.stringify(parsed)
    });
  }
  return out;
}
function allowedName(tools, name) {
  return tools.some((t) => t.name === name);
}
function validCall(name, args, tools, toolChoice) {
  if (!name || !allowedName(tools, name) || !toolChoiceAllows(toolChoice, name)) return null;
  if (!args || typeof args !== "object") return null;
  return {
    id: `call_${crypto.randomUUID()}`,
    type: "function",
    name,
    arguments: JSON.stringify(args)
  };
}
function parseToolRouterDecision(text, tools, toolChoice) {
  const trimmed = text.trim();
  const calls = [];
  for (const line of trimmed.split(/\r?\n/)) {
    const m = /^CALL_TOOL:\s*(.+)$/i.exec(line.trim());
    if (!m) continue;
    const rest = m[1];
    const start2 = rest.indexOf("(");
    const end2 = rest.lastIndexOf(")");
    if (start2 <= 0 || end2 <= start2) continue;
    const name = rest.slice(0, start2).trim();
    try {
      const args = JSON.parse(rest.slice(start2 + 1, end2));
      const call = validCall(name, args, tools, toolChoice);
      if (call) calls.push(call);
    } catch {
    }
  }
  if (calls.length > 0) return { decided: true, calls };
  if (/^no_tool_needed$/i.test(trimmed) || trimmed.toLowerCase().includes("no_tool_needed")) {
    return { decided: true, calls: [] };
  }
  let probe = trimmed;
  const fence = probe.indexOf("```");
  if (fence >= 0) {
    probe = probe.slice(fence + 3).replace(/```$/, "").trim();
    probe = probe.replace(/^(json|JSON)\s*/, "");
  }
  const start = probe.indexOf("{");
  const end = probe.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      const parsed = JSON.parse(probe.slice(start, end + 1));
      if (Array.isArray(parsed.calls)) {
        for (const c of parsed.calls) {
          const call = validCall(
            typeof c?.name === "string" ? c.name : "",
            c?.arguments,
            tools,
            toolChoice
          );
          if (call) calls.push(call);
        }
        return { decided: true, calls };
      }
    } catch {
    }
  }
  return { decided: false, calls: [] };
}
function resolveChatInvocationOverrides(tier) {
  if (tier === "enterprise") {
    return {
      optionsSets: [...M365_ENTERPRISE_OPTION_SETS],
      tone: "Magic",
      allowedMessageTypes: [...ALLOWED_MESSAGE_TYPES, ...M365_ENTERPRISE_EXTRA_MESSAGE_TYPES],
      disconnectBehavior: "continue"
    };
  }
  return {
    optionsSets: [...M365_DEFAULT_OPTION_SETS],
    // 2026-08-21 capture — the individual/consumer surface now sends "Magic"
    // (capitalized), matching the enterprise tone literal. The #10718
    // lowercase "magic" is part of the shape that gets silently dropped.
    tone: "Magic",
    allowedMessageTypes: ALLOWED_MESSAGE_TYPES,
    // 2026-08-21 capture — disconnectBehavior:"continue" is now present on the
    // individual/consumer wire too, not just enterprise (see ChatInvocationOptions).
    disconnectBehavior: "continue"
  };
}
const M365_MODEL_TONE_MAP = {
  "copilot-m365-claude-opus": "Claude_Opus",
  "copilot-m365-gpt-5-6-reasoning": "Gpt_5_6_Reasoning",
  "copilot-m365-gpt-5-5-chat": "Gpt_5_5_Chat"
};
function resolveToneForModel(model) {
  if (!model) return void 0;
  return M365_MODEL_TONE_MAP[model];
}
function buildChatInvocation(opts) {
  const clientInfo = {
    clientAppName: "Office",
    clientPlatform: "mcmcopilot-web",
    clientEntrypoint: "mcmcopilot-officeweb",
    clientSessionId: opts.sessionId,
    ProductCategory: "Chat",
    clientAppType: "Web",
    productEntryPoint: "ChatPanel",
    deviceOS: "Windows",
    deviceType: "Desktop",
    clientPlatformVersion: "10"
  };
  return {
    type: 4,
    target: "chat",
    invocationId: "0",
    arguments: [
      {
        allowedMessageTypes: opts.allowedMessageTypes ? [...opts.allowedMessageTypes] : [...ALLOWED_MESSAGE_TYPES],
        clientCorrelationId: opts.clientCorrelationId ?? opts.traceId,
        clientInfo,
        conversationId: opts.conversationId,
        extraExtensionParameters: {},
        isStartOfSession: opts.isStartOfSession ?? true,
        message: {
          adaptiveCards: [],
          attachments: null,
          author: "user",
          clientInfo,
          clientPreferences: {},
          connectedFederatedConnections: ["dummyId"],
          entityAnnotationTypes: ["People", "File", "Event", "Email", "TeamsMessage"],
          experienceType: "Default",
          inputMethod: "Keyboard",
          locale: opts.locale ?? "en-us",
          locationInfo: {
            timeZone: opts.timeZone ?? "UTC",
            timeZoneOffset: opts.timeZoneOffset ?? 0
          },
          messageType: "Chat",
          requestId: opts.requestId,
          text: opts.text
        },
        isSbsSupported: true,
        options: {},
        optionsSets: opts.optionsSets ?? [...M365_DEFAULT_OPTION_SETS],
        // 2026-08-21 capture (#11069): BingWebSearch is now the universal
        // BuiltIn plugin on individual/consumer tier; keep an opt-out override.
        plugins: opts.plugins ?? [{ Id: "BingWebSearch", Source: "BuiltIn" }],
        ...opts.customInstructions ? { customInstructions: opts.customInstructions } : {},
        productThreadType: "Office",
        renderReferencesBehindEOS: true,
        sessionId: opts.sessionId,
        sliceIds: [],
        source: "officeweb",
        streamingMode: "ConciseWithPadding",
        threadLevelGptId: {},
        // 2026-08-21 capture (#11069): tone is now capitalized "Magic" on both tiers.
        tone: opts.tone ?? "Magic",
        toolChoice: opts.toolChoice ?? null,
        traceId: opts.traceId,
        // 2026-08-21 capture — disconnectBehavior:"continue" is sent on every
        // tier now, not gated to enterprise as the #8971 comment described.
        disconnectBehavior: opts.disconnectBehavior ?? "continue"
      }
    ]
  };
}
function isUpdateFrame(frame) {
  return !!frame && frame.type === 1 && frame.target === "update";
}
function isCompletionFrame(frame) {
  return !!frame && frame.type === 3;
}
function extractCompletionError(frame) {
  if (!frame || frame.type !== 3) return null;
  const error = frame.error;
  if (!error || typeof error !== "object") return null;
  const message = error.message;
  return typeof message === "string" && message.length > 0 ? message : JSON.stringify(error);
}
function isToolProgressMessage(m) {
  if (m.messageType === "Progress") return true;
  const ct = m.contentType;
  return ct === "SearchResults" || ct === "Code" || ct === "ToolCall" || ct === "EarlyProgress";
}
function isToolProgressFrame(frame) {
  if (!isUpdateFrame(frame)) return false;
  const args = frame.arguments;
  const first = Array.isArray(args) ? args[0] : void 0;
  const messages = first?.messages;
  if (!Array.isArray(messages)) return false;
  return messages.some(
    (m) => !!m && typeof m === "object" && isToolProgressMessage(m)
  );
}
function isLastUpdate(frame) {
  if (!isUpdateFrame(frame)) return false;
  const args = frame.arguments;
  const first = Array.isArray(args) ? args[0] : void 0;
  return first?.isLastUpdate === true;
}
function extractBotText(frame) {
  if (!isUpdateFrame(frame)) return null;
  const args = frame.arguments;
  const first = Array.isArray(args) ? args[0] : void 0;
  const messages = first?.messages;
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m) continue;
    const author = m.author;
    const text = m.text;
    if (isToolProgressMessage(m)) continue;
    if ((author === "bot" || author === void 0) && typeof text === "string" && text.length > 0) {
      return text;
    }
  }
  return null;
}
function incrementalDelta(previous, next) {
  if (!next) return "";
  if (next === previous) return "";
  if (next.startsWith(previous)) return next.slice(previous.length);
  return next;
}
function extractWriteAtCursor(frame) {
  if (!isUpdateFrame(frame)) return null;
  const args = frame.arguments;
  const first = Array.isArray(args) ? args[0] : void 0;
  const wac = first?.writeAtCursor;
  return typeof wac === "string" && wac.length > 0 ? wac : null;
}
function extractFinalResultMessage(frame) {
  if (!frame || frame.type !== 2) return null;
  const item = frame.item;
  const result = item?.result;
  const message = result?.message;
  return typeof message === "string" && message.length > 0 ? message : null;
}
function accumulateBotContent(previous, frame) {
  if (isToolProgressFrame(frame)) return { delta: "", next: previous };
  const snapshot = extractBotText(frame);
  if (snapshot) {
    return { delta: incrementalDelta(previous, snapshot), next: snapshot };
  }
  const wac = extractWriteAtCursor(frame);
  if (wac) {
    return { delta: wac, next: previous + wac };
  }
  return { delta: "", next: previous };
}
export {
  ALLOWED_MESSAGE_TYPES,
  CHAT_METRICS_FRAME,
  HANDSHAKE_REQUEST,
  KEEPALIVE_PING,
  M365_DEFAULT_OPTION_SETS,
  M365_ENTERPRISE_EXTRA_MESSAGE_TYPES,
  M365_ENTERPRISE_OPTION_SETS,
  M365_MODEL_TONE_MAP,
  RECORD_SEPARATOR,
  accumulateBotContent,
  buildChatInvocation,
  clientPlugins,
  encodeFrame,
  extractBotText,
  extractCompletionError,
  extractFinalResultMessage,
  extractWriteAtCursor,
  handshakeError,
  handshakeFrame,
  incrementalDelta,
  isCompletionFrame,
  isLastUpdate,
  isToolProgressFrame,
  isUpdateFrame,
  keepaliveFrame,
  metricsFrame,
  parseFencedToolCalls,
  parseFrame,
  parseToolRouterDecision,
  resolveChatInvocationOverrides,
  resolveToneForModel,
  splitFrames
};
