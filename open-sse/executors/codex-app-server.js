import {
  bridgeToResponsesSSE,
  buildResponseJSON
} from "../utils/omni/codexBridge.js";
import { AsyncEventQueue } from "../utils/omni/codexEventQueue.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import { PROVIDERS } from "./executorConstants.js";
import { BaseExecutor } from "./base.js";
import {
  CodexAppServerClient
} from "../utils/omni/codexAppServerClient.js";
import { resolveAppServerConfig, resolveThreadStartPolicy } from "../utils/omni/codexAppServerConfig.js";
import {
  translateNotification,
  translateToolCall
} from "../utils/omni/codexAppServerEvents.js";
const JSON_HEADERS = { "Content-Type": "application/json" };
const SSE_HEADERS = {
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  "Content-Type": "text/event-stream; charset=utf-8"
};
function extractPromptText(body) {
  if (!body || typeof body !== "object") return "";
  const input = body.input;
  if (typeof input === "string") return input;
  if (input == null) return "";
  const items = Array.isArray(input) ? input : [input];
  const chunks = [];
  for (const item of items) {
    collectText(item, chunks);
  }
  return chunks.join("\n").trim();
}
function collectText(item, out) {
  if (typeof item === "string") {
    if (item.length > 0) out.push(item);
    return;
  }
  if (!item || typeof item !== "object") return;
  const rec = item;
  if (typeof rec.text === "string" && rec.text.length > 0) {
    out.push(rec.text);
    return;
  }
  const content = rec.content;
  if (typeof content === "string") {
    if (content.length > 0) out.push(content);
    return;
  }
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part && typeof part === "object") {
        const text = part.text;
        if (typeof text === "string" && text.length > 0) out.push(text);
      } else if (typeof part === "string" && part.length > 0) {
        out.push(part);
      }
    }
  }
}
function extractEffort(body) {
  if (!body || typeof body !== "object") return void 0;
  const reasoning = body.reasoning;
  if (reasoning && typeof reasoning === "object") {
    const effort = reasoning.effort;
    if (typeof effort === "string" && effort.length > 0) return effort;
  }
  return void 0;
}
const EMPTY_OBJECT_SCHEMA = { type: "object", properties: {} };
const FREEFORM_INPUT_SCHEMA = {
  type: "object",
  properties: { input: { type: "string", description: "Raw tool input." } },
  required: ["input"]
};
function asRecord(v) {
  return v && typeof v === "object" && !Array.isArray(v) ? v : null;
}
function buildAppServerToolMaps(body) {
  const namespace = /* @__PURE__ */ new Map();
  const freeform = /* @__PURE__ */ new Set();
  const toolSearch = /* @__PURE__ */ new Set();
  const specs = [];
  const rec = asRecord(body);
  const tools = rec && Array.isArray(rec.tools) ? rec.tools : [];
  const pushFn = (name, description, inputSchema) => {
    specs.push({ type: "function", name, description, inputSchema });
  };
  for (const raw of tools) {
    const t = asRecord(raw);
    if (!t) continue;
    const type = t.type;
    const desc = typeof t.description === "string" ? t.description : "";
    if (type === "function" && typeof t.name === "string") {
      const wireName = t.name;
      pushFn(wireName, desc, asRecord(t.parameters) ?? EMPTY_OBJECT_SCHEMA);
    } else if (type === "namespace" && Array.isArray(t.tools) && typeof t.name === "string") {
      const ns = t.name;
      for (const innerRaw of t.tools) {
        const inner = asRecord(innerRaw);
        if (inner && inner.type === "function" && typeof inner.name === "string") {
          const wireName = `${ns}__${inner.name}`;
          namespace.set(wireName, { namespace: ns, name: inner.name });
          const innerDesc = typeof inner.description === "string" ? inner.description : "";
          pushFn(wireName, innerDesc, asRecord(inner.parameters) ?? EMPTY_OBJECT_SCHEMA);
        }
      }
    } else if (type === "custom" && typeof t.name === "string") {
      const wireName = t.name;
      freeform.add(wireName);
      pushFn(wireName, desc, FREEFORM_INPUT_SCHEMA);
    } else if (type === "tool_search") {
      const wireName = "tool_search";
      toolSearch.add(wireName);
      pushFn(
        wireName,
        desc || "Search for additional tools to load for the next turn.",
        asRecord(t.parameters) ?? {
          type: "object",
          properties: { query: { type: "string" }, limit: { type: "number" } },
          required: ["query"]
        }
      );
    } else if (typeof t.name === "string" && type !== "web_search" && type !== "image_generation" && type !== "web_search_preview") {
      pushFn(t.name, desc, asRecord(t.parameters) ?? EMPTY_OBJECT_SCHEMA);
    }
  }
  return { namespace, freeform, toolSearch, specs };
}
class CodexAppServerExecutor extends BaseExecutor {
  clientOptions;
  /**
   * @param clientOptions transport options (websocketFn, timeouts).
   * @param providerId which provider identity this executor reports as. Defaults
   *   to "codex" so the existing per-connection `codexTransport==="app-server"`
   *   flag path (routed through CodexExecutor for the `codex` provider) keeps its
   *   original identity. The first-class `codex-app-server` sibling passes
   *   "codex-app-server" so logs/quota scoping and the golden executor map reflect
   *   the real provider. Falls back to PROVIDERS.codex when the sibling registry
   *   entry is not present (defensive; both share the codex backend).
   */
  constructor(clientOptions = {}, providerId = "codex") {
    super(providerId, PROVIDERS[providerId] ?? PROVIDERS.codex);
    this.clientOptions = clientOptions;
  }
  async execute(input) {
    const psd = input.credentials?.providerSpecificData;
    const config = resolveAppServerConfig(psd);
    if (!config) {
      return errorResponse(
        503,
        "Codex app-server transport is not configured (missing url or token)",
        "codex_app_server_unconfigured"
      );
    }
    const policy = resolveThreadStartPolicy(config, psd);
    const promptText = extractPromptText(input.body);
    const effort = extractEffort(input.body);
    const toolMaps = buildAppServerToolMaps(input.body);
    const hasTools = toolMaps.specs.length > 0;
    const events = new AsyncEventQueue();
    const client = new CodexAppServerClient({
      ...this.clientOptions,
      autoApproveApprovals: policy.autoApprove
    });
    const run = async () => {
      let terminated = false;
      let settleTurn;
      const turnDone = new Promise((resolve) => {
        settleTurn = resolve;
      });
      const markTerminated = () => {
        if (terminated) return;
        terminated = true;
        settleTurn();
      };
      const finishTurn = () => {
        if (terminated) return;
        events.push({ type: "done", endTurn: true });
        events.close();
        markTerminated();
      };
      try {
        await client.connect(config.url, config.token);
        await client.request("initialize", {
          clientInfo: {
            name: "omniroute-codex-app-server",
            title: null,
            version: "1.0"
          },
          // Harness function tools are advertised via thread/start's `dynamicTools`,
          // which is an EXPERIMENTAL app-server field: opt into experimental API so
          // codex accepts it (and can emit the item/tool/call ServerRequest).
          capabilities: hasTools ? { experimentalApi: true, requestAttestation: false } : null
        });
        const threadResult = await client.request("thread/start", {
          cwd: config.cwd,
          // OmniRoute is a router: the HARNESS that consumes OmniRoute owns tool
          // execution and policy. codex must therefore NEVER block a turn waiting
          // on its own interactive approval (approvalPolicy "never"). Its own
          // sandbox defaults to "workspace-write" (hardened after the #11205
          // security review; WAS "danger-full-access") so codex-decided host
          // commands are confined to the turn's cwd tree — widen only via an
          // explicit operator override. Server→client approval prompts (codex's
          // own command/file/permission requests, NOT the harness tool
          // passthrough) are auto-DENIED by the client unless the operator opted
          // into auto-approval (see CodexAppServerClient).
          approvalPolicy: policy.approvalPolicy,
          sandbox: policy.sandbox,
          // INBOUND harness tools → codex. The client tells the app-server which
          // function tools are available for the thread via the `dynamicTools`
          // field on thread/start (a DynamicToolSpec[] under the experimental API,
          // verified from the real codex binary; see appServerEvents.ts). codex
          // then invokes them by sending the `item/tool/call` ServerRequest back
          // to the client (DynamicToolCallParams), which we PASS THROUGH.
          ...hasTools ? { dynamicTools: toolMaps.specs } : {}
        });
        const threadId = threadResult && typeof threadResult.thread?.id === "string" ? threadResult.thread.id : threadResult && typeof threadResult.threadId === "string" ? threadResult.threadId : "";
        client.onNotification((method, params) => {
          if (terminated) return;
          const isTerminal = translateNotification(method, params, (event) => events.push(event));
          if (isTerminal) {
            events.close();
            markTerminated();
          }
        });
        client.onToolCall((_id, params, api) => {
          if (terminated) return;
          const toolParams = params && typeof params === "object" ? params : {};
          translateToolCall(toolParams, (event) => events.push(event));
          api.respond({
            contentItems: [
              {
                type: "inputText",
                text: "router: tool executed by harness; call surfaced as function_call"
              }
            ],
            success: false
          });
          finishTurn();
        });
        const onAbort = () => {
          try {
            client.notify("turn/interrupt", { threadId, turnId: "" });
          } catch {
          }
          if (!terminated) {
            events.close();
            markTerminated();
          }
        };
        input.signal?.addEventListener("abort", onAbort, { once: true });
        const turnInput = [
          { type: "text", text: promptText, text_elements: [] }
        ];
        await client.request("turn/start", {
          threadId,
          input: turnInput,
          model: input.model,
          ...effort ? { effort } : {}
        });
        await turnDone;
      } catch (err) {
        if (!terminated) {
          events.push({
            type: "error",
            message: sanitizeErrorMessage(err instanceof Error ? err.message : err),
            status: 502,
            errorType: "provider_error",
            code: "codex_app_server_turn_failed"
          });
          events.close();
          markTerminated();
        }
      } finally {
        client.close();
      }
    };
    if (!input.stream) {
      const running = run();
      const collected = await events.collect();
      await running;
      const response = buildResponseJSON(collected, input.model, {
        toolNsMap: toolMaps.namespace,
        freeformToolNames: toolMaps.freeform,
        toolSearchToolNames: toolMaps.toolSearch
      });
      return {
        response: new Response(JSON.stringify(response), { status: 200, headers: JSON_HEADERS }),
        url: config.url
      };
    }
    void run();
    const stream = bridgeToResponsesSSE(
      events,
      input.model,
      toolMaps.namespace,
      toolMaps.freeform,
      toolMaps.toolSearch,
      () => client.close(),
      2e3
    );
    return {
      response: new Response(stream, { status: 200, headers: SSE_HEADERS }),
      url: config.url
    };
  }
}
function errorResponse(status, message, code) {
  return new Response(
    JSON.stringify({
      error: {
        code,
        message: sanitizeErrorMessage(message),
        type: status >= 500 ? "provider_error" : "invalid_request_error"
      }
    }),
    { status, headers: JSON_HEADERS }
  );
}
export {
  CodexAppServerExecutor,
  extractPromptText
};
