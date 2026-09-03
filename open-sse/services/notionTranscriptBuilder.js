import { randomUUID } from "node:crypto";
import { extractNotionMessageText } from "./notionThreadSessions.js";
function isoNow() {
  return (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, (m) => m);
}
function buildNotionConfigStep(model, agent) {
  const isCustom = Boolean(agent?.workflowId);
  const configValue = {
    type: "workflow",
    // Match live browser defaults (2026-07-20 capture) for fewer plan/feature mismatches.
    enableAgentAutomations: true,
    enableAgentIntegrations: true,
    enableCustomAgents: true,
    enableScriptAgent: true,
    enableAgentDiffs: true,
    enableCsvAttachmentSupport: true,
    enableComputer: true,
    enableCreateAndRunThread: true,
    enableAgentGenerateImage: !isCustom,
    useWebSearch: true,
    searchScopes: [{ type: "everything" }],
    availableConnectors: [],
    enableUserSessionContext: false,
    isCustomAgent: isCustom,
    isCustomAgentBuilder: false,
    isCustomAgentCreate: false,
    isAgentResearchRequest: false,
    useCustomAgentDraft: isCustom,
    modelFromUser: !isCustom && Boolean(model),
    databaseAgentConfigMode: false,
    isOnboardingAgent: false,
    isMobile: false
  };
  if (isCustom && agent?.workflowId) {
    configValue.workflowId = agent.workflowId;
  }
  if (!isCustom && model) configValue.model = model;
  return { id: randomUUID(), type: "config", value: configValue };
}
function buildNotionContextValue(opts) {
  const isCustom = Boolean(opts.agent?.workflowId);
  const contextValue = {
    timezone: "UTC",
    surface: isCustom ? "custom_agent" : "ai_module",
    currentDatetime: opts.now
  };
  if (opts.spaceId) contextValue.spaceId = opts.spaceId;
  if (opts.userId) contextValue.userId = opts.userId;
  if (isCustom && opts.agent?.workflowId) {
    contextValue.workflowId = opts.agent.workflowId;
    if (opts.agent.contextPageId) {
      contextValue.context_page_id = opts.agent.contextPageId;
    }
  }
  return contextValue;
}
function buildNotionMessageStep(m, contextValue, opts) {
  const text = extractNotionMessageText(m?.content);
  if (!text || text.length === 0) return null;
  const role = (m.role || "").toLowerCase();
  if (role === "system") {
    const existing = typeof contextValue.instructions === "string" ? contextValue.instructions : "";
    contextValue.instructions = existing ? `${existing}
${text}` : text;
    return null;
  }
  if (role === "assistant") {
    return {
      id: randomUUID(),
      type: "agent-inference",
      value: [{ type: "text", content: text }]
    };
  }
  const userStep = {
    id: randomUUID(),
    type: "user",
    value: [[text]],
    createdAt: opts.now
  };
  if (opts.userId) userStep.userId = opts.userId;
  return userStep;
}
function messagesForNotionTranscript(messages, isFollowUp) {
  if (!isFollowUp || !messages.length) return messages;
  let lastAsst = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = (messages[i]?.role || "").toLowerCase();
    if (role === "assistant" || role === "ai" || role === "model") {
      lastAsst = i;
      break;
    }
  }
  if (lastAsst < 0) return messages;
  const slice = messages.slice(lastAsst + 1);
  if (slice.length === 0) {
    const lastUser = [...messages].reverse().find((m) => {
      const r = (m.role || "").toLowerCase();
      return r === "user" || r === "human";
    });
    return lastUser ? [lastUser] : messages;
  }
  return slice;
}
function buildNotionTranscript(messages, opts = {}) {
  const trimmedModel = typeof opts.notionModel === "string" ? opts.notionModel.trim() : "";
  const model = trimmedModel && trimmedModel !== "notion-ai" ? trimmedModel : "";
  const now = isoNow();
  const agent = opts.agent?.workflowId ? opts.agent : void 0;
  const isFollowUp = Boolean(opts.isFollowUp);
  const contextValue = buildNotionContextValue({
    spaceId: opts.spaceId,
    userId: opts.userId,
    now,
    agent
  });
  const entries = [
    buildNotionConfigStep(model, agent),
    { id: randomUUID(), type: "context", value: contextValue }
  ];
  const msgs = messagesForNotionTranscript(messages, isFollowUp);
  for (const m of msgs) {
    const step = buildNotionMessageStep(m, contextValue, { userId: opts.userId, now });
    if (step) entries.push(step);
  }
  return entries;
}
export {
  buildNotionTranscript,
  messagesForNotionTranscript
};
