import { resolvePublicCred } from "../utils/publicCreds.js";
import { randomUUID, randomBytes } from "node:crypto";
const M365_INDIVIDUAL_DEFAULTS = {
  host: "substrate.office.com",
  source: "officeweb",
  product: "Office",
  agentHost: "Bizchat.FullScreen",
  licenseType: "Starter",
  agent: "web",
  scenario: "OfficeWebPaidConsumerCopilot"
};
const M365_EDU_OVERRIDES = {
  scenario: "OfficeWebIncludedCopilot",
  isEdu: "true",
  licenseType: "Starter"
};
const M365_ENTERPRISE_OVERRIDES = {
  agent: "work",
  scenario: "officeweb",
  licenseType: "Premium"
};
const M365_DEFAULT_VARIANTS = [
  "EnableMcpServerWidgets",
  "feature.EnableMcpServerWidgets",
  "feature.EnableLuForChatCIQ",
  "feature.enableChatCIQPlugin",
  "EnableRequestPlugins",
  "feature.EnableSensitivityLabels",
  "EnableUnsupportedUrlDetector",
  "feature.IsCustomEngineCopilotEnabled",
  "feature.bizchatfluxv3",
  "feature.enablechatpages",
  "feature.enableCodeCanvas",
  "feature.turnOnDARecommendation",
  "feature.IsStreamingModeInChatRequestEnabled",
  "IncludeSourceAttributionsConcise",
  "SkipPublishEmptyMessage",
  "feature.EnableDeduplicatingSourceAttributions",
  "Enable3PActionProgressMessages",
  "feature.enableClientWebRtc",
  "feature.EnableMeetingRecapOfSeriesMeetingWithCiq",
  "feature.cwcfluxv3fe",
  "feature.cwcfluxv3fem",
  "feature.EnableReferencesListCompleteSignal",
  "feature.StorageMessageSplitDisabled",
  "feature.EnableCuaTakeControlApi",
  "SingletonEnvOn",
  "EnableComposeWidget",
  "feature.cwcallowedos",
  "feature.EnableMergingPureDeltas",
  "feature.disabledisallowedmsgs",
  "feature.enableCitationsForSynthesisData",
  "feature.EnableConversationShareApis",
  "feature.enableGenerateGraphicArtOptionsSet",
  "cdximagen",
  "feature.EnableUpdatedUXForConfirmationDialog",
  "feature.EnableContentApiandDocTypeHtmlInRichAnswers",
  "cdxgrounding_api_v2_rich_web_answers_reference_bottom_force",
  "cdxenablerenderforisocomp",
  "feature.EnableClientFileURLSupportForOfficeWebPaidCopilot",
  "feature.EnableDesignEditorImageGrounding",
  "feature.EnableDesignerEditor",
  "feature.EnableSkipRehydrationForSpeCIdImages",
  "feature.EnablePersonalizationForMSA",
  "agt_bizchat_enableRichResponses",
  "feature.EnableBase64DataInMessageAnnotations",
  "feature.EnableSkipEmittingMessageOnFlush",
  "feature.EnableRemoveEmptySourceAttributions",
  "feature.EnableRemoveStreamingMode"
];
function newChatSessionId() {
  return randomBytes(16).toString("hex");
}
function parsePastedCredential(raw) {
  const value = raw.trim();
  const parts = {};
  for (const segment of value.split(/[;\n]/)) {
    const separator = segment.indexOf("=");
    if (separator <= 0) continue;
    const key = segment.slice(0, separator).trim();
    const partValue = segment.slice(separator + 1).trim();
    if (key && partValue) parts[key] = partValue;
  }
  if (/^wss:\/\/substrate\.office\.com\/m365Copilot\/Chathub\//i.test(value)) {
    try {
      const url = new URL(value);
      parts.access_token ||= url.searchParams.get("access_token") || "";
      parts.chathubPath ||= decodeURIComponent(
        url.pathname.split("/m365Copilot/Chathub/")[1] || ""
      );
    } catch {
    }
  }
  return {
    accessToken: parts.access_token || parts.accessToken,
    chathubPath: parts.chathubPath || parts.userTenant
  };
}
function resolveConnectionParams(credentials) {
  const psd = credentials?.providerSpecificData ?? {};
  const parsedApiKey = typeof credentials?.apiKey === "string" ? parsePastedCredential(credentials.apiKey) : {};
  const credentialsJwt = typeof credentials?.accessToken === "string" && credentials.accessToken.split(".").length === 3 ? credentials.accessToken : "";
  const accessToken = credentialsJwt || parsedApiKey.accessToken || typeof credentials?.apiKey === "string" && credentials.apiKey && !credentials.apiKey.includes("access_token=") && credentials.apiKey || typeof psd.accessToken === "string" && psd.accessToken || typeof psd.access_token === "string" && psd.access_token || "";
  if (!accessToken) {
    return { error: "Missing M365 Copilot access_token. Paste it as the provider credential." };
  }
  const chathubPath = parsedApiKey.chathubPath || typeof psd.chathubPath === "string" && psd.chathubPath || typeof psd.userTenant === "string" && psd.userTenant || "";
  if (!chathubPath || !chathubPath.includes("@")) {
    return {
      error: "Missing M365 Chathub path. Paste the '<user-oid>@<tenant-id>' segment from the WebSocket URL."
    };
  }
  const host = typeof psd.host === "string" && psd.host || M365_INDIVIDUAL_DEFAULTS.host;
  const variants = typeof psd.variants === "string" && psd.variants ? psd.variants : void 0;
  return { host, chathubPath, accessToken, variants, ...resolveTierOverrides(psd) };
}
function resolveTierOverrides(psd) {
  const tier = typeof psd.tier === "string" ? psd.tier.toLowerCase() : "";
  const isEduTier = tier === "edu" || tier === "included";
  const isEnterpriseTier = tier === "enterprise" || tier === "work";
  const psdIsEdu = typeof psd.isEdu === "string" && psd.isEdu || typeof psd.isEdu === "boolean" && String(psd.isEdu) || void 0;
  return {
    scenario: typeof psd.scenario === "string" && psd.scenario || (isEduTier ? M365_EDU_OVERRIDES.scenario : void 0) || (isEnterpriseTier ? M365_ENTERPRISE_OVERRIDES.scenario : void 0),
    isEdu: psdIsEdu || (isEduTier ? M365_EDU_OVERRIDES.isEdu : void 0),
    licenseType: typeof psd.licenseType === "string" && psd.licenseType || (isEduTier ? M365_EDU_OVERRIDES.licenseType : void 0) || (isEnterpriseTier ? M365_ENTERPRISE_OVERRIDES.licenseType : void 0),
    agent: typeof psd.agent === "string" && psd.agent || (isEnterpriseTier ? M365_ENTERPRISE_OVERRIDES.agent : void 0),
    tier: isEduTier ? "edu" : isEnterpriseTier ? "enterprise" : void 0
  };
}
function buildWsUrl(params) {
  const sessionKey = newChatSessionId();
  const query = new URLSearchParams({
    chatsessionid: sessionKey,
    XRoutingParameterSessionKey: sessionKey,
    clientrequestid: sessionKey,
    "X-SessionId": randomUUID(),
    ConversationId: randomUUID(),
    access_token: params.accessToken,
    variants: params.variants ?? M365_DEFAULT_VARIANTS.join(","),
    source: M365_INDIVIDUAL_DEFAULTS.source,
    product: M365_INDIVIDUAL_DEFAULTS.product,
    agentHost: M365_INDIVIDUAL_DEFAULTS.agentHost,
    licenseType: params.licenseType ?? M365_INDIVIDUAL_DEFAULTS.licenseType,
    isEdu: params.isEdu ?? "false",
    agent: params.agent ?? M365_INDIVIDUAL_DEFAULTS.agent,
    scenario: params.scenario ?? M365_INDIVIDUAL_DEFAULTS.scenario
  });
  return `wss://${params.host}/m365Copilot/Chathub/${params.chathubPath}?${query.toString()}`;
}
function redactWsUrl(wsUrl) {
  return wsUrl.replace(/access_token=[^&]*/i, "access_token=REDACTED");
}
const M365_OAUTH_CLIENT_ID = resolvePublicCred("m365_oauth_client_id");
const M365_OAUTH_SCOPE = "openid profile offline_access https://substrate.office.com/sydney/M365Chat.Read https://substrate.office.com/sydney/sydney.readwrite";
const M365_REFRESH_LEAD_MS = 5 * 60 * 1e3;
function decodeJwtClaims(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload && typeof payload === "object" ? payload : null;
  } catch {
    return null;
  }
}
function tokenNeedsRefresh(token, leadMs = M365_REFRESH_LEAD_MS) {
  const claims = decodeJwtClaims(token);
  if (!claims?.exp) return true;
  return claims.exp * 1e3 <= Date.now() + leadMs;
}
function currentM365AccessToken(credentials) {
  if (typeof credentials?.accessToken === "string" && credentials.accessToken.split(".").length === 3) {
    return credentials.accessToken;
  }
  if (typeof credentials?.apiKey === "string") {
    const parsed = parsePastedCredential(credentials.apiKey);
    if (parsed.accessToken && parsed.accessToken.split(".").length === 3) return parsed.accessToken;
    return parsed.accessToken || "";
  }
  const psd = credentials?.providerSpecificData ?? {};
  if (typeof psd.accessToken === "string") return psd.accessToken;
  if (typeof psd.access_token === "string") return psd.access_token;
  return "";
}
function currentM365ChathubPath(credentials) {
  const psd = credentials?.providerSpecificData ?? {};
  return (typeof credentials?.apiKey === "string" ? parsePastedCredential(credentials.apiKey).chathubPath : "") || typeof psd.chathubPath === "string" && psd.chathubPath || typeof psd.userTenant === "string" && psd.userTenant || "";
}
async function refreshM365AccessToken(refreshToken, tid, log) {
  const endpoint = `https://login.microsoftonline.com/${tid || "common"}/oauth2/v2.0/token`;
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        client_id: M365_OAUTH_CLIENT_ID,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        scope: M365_OAUTH_SCOPE
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.access_token !== "string") {
      const error = typeof data.error === "string" ? data.error : `HTTP ${res.status}`;
      log?.warn?.("M365_TOKEN", `refresh_token grant failed: ${error}`);
      return { error };
    }
    log?.info?.("M365_TOKEN", "access token refreshed via refresh_token grant");
    return {
      accessToken: data.access_token,
      refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : void 0,
      expiresIn: typeof data.expires_in === "number" ? data.expires_in : void 0
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    log?.warn?.("M365_TOKEN", `refresh request failed: ${error}`);
    return { error };
  }
}
function extractToolSpec(body) {
  const raw = Array.isArray(body?.tools) ? body.tools : [];
  const tools = [];
  for (const t of raw) {
    if (t?.type !== "function") continue;
    const fn = t.function ?? {};
    const name = typeof fn.name === "string" ? fn.name : "";
    if (!name) continue;
    tools.push({
      name,
      description: typeof fn.description === "string" ? fn.description : "",
      parameters: fn.parameters && typeof fn.parameters === "object" ? fn.parameters : null
    });
  }
  return { tools, toolChoice: body?.tool_choice ?? null };
}
function compactToolResult(text, maxChars = 4e3) {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}
\u2026[truncated ${text.length - maxChars} chars]`;
}
function messageText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(
      (p) => p && typeof p === "object" && typeof p.text === "string" ? p.text : ""
    ).filter(Boolean).join("\n");
  }
  return content == null ? "" : JSON.stringify(content);
}
function flattenMessages(body) {
  const messages = body?.messages || [];
  const parts = [];
  for (const m of messages) {
    const role = typeof m.role === "string" ? m.role.toLowerCase().trim() : "user";
    const text = messageText(m.content).trim();
    if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      if (text) parts.push(`[${role}]
${text}`);
      parts.push(`[${role} tool_calls]
${JSON.stringify(m.tool_calls)}`);
      continue;
    }
    if (role === "tool") {
      const id = typeof m.tool_call_id === "string" ? m.tool_call_id : "";
      parts.push(`[tool result id=${id}]
${compactToolResult(text)}`);
      continue;
    }
    if (!text) continue;
    parts.push(`[${role}]
${text}`);
  }
  return parts.join("\n\n").trim();
}
function toolProtocolPrompt(text, tools, toolChoice) {
  if (tools.length === 0 || toolChoice === "none") {
    return `Please answer the following request in full. Do not truncate or abbreviate your response.

${text}`;
  }
  const defs = tools.map((t) => {
    const params = t.parameters ? JSON.stringify(t.parameters, null, 2) : "{}";
    return `${t.name} \u2014 ${t.description}
\`\`\`${t.name}
${params}
\`\`\``;
  });
  return `You are an execution agent operating on behalf of the application that sent this request. The tools below are real, active, and callable right now \u2014 they were registered by that application for this conversation. Do not analyze whether tools are registered, available, or permitted: they are. Never state that a tool is unavailable or that you cannot call tools.
When the user's request requires a tool, call it by emitting one or more fenced code blocks. Each block's info string is the exact tool name and its body is a single JSON object of arguments. For independent operations, emit multiple blocks in one response. Do not wrap tool calls in any other structure, and wait for the tool result before claiming completion.

<tools>
${defs.join("\n\n")}
</tools>

${text}`;
}
function buildPrompt(body) {
  const { tools, toolChoice } = extractToolSpec(body);
  return toolProtocolPrompt(flattenMessages(body), tools, toolChoice);
}
function buildRouterPrompt(text, tools, toolChoice) {
  const defs = JSON.stringify(
    tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters ?? {} }
    }))
  );
  const choice = typeof toolChoice === "string" && toolChoice !== "auto" && toolChoice !== "none" ? toolChoice : toolChoice && typeof toolChoice === "object" ? toolChoice.function?.name ?? "auto" : "auto";
  let rules = `- If a tool is needed, respond with: CALL_TOOL: tool_name({"arg1":"value1"})
- If multiple independent tools are needed, output one CALL_TOOL line per tool
- If no tool is needed, respond with: NO_TOOL_NEEDED
- Only use tools from the available list above
- Validate all arguments against the tool's schema
- Do not invent tools that are not in the list`;
  if (text.includes("[tool result id=") || text.includes("[assistant tool_calls]")) {
    rules += `
- Completed evidence must not be repeated: prior tool_calls/tool results are already delivered, never re-invoke them
- Only start a new tool call when fresh unfinished work remains on the current request`;
  }
  return `You are a tool selection assistant. Based on the user request, decide which tool to call next.

Available tools: ${defs}

MODE: ${choice}

Rules:
${rules}

User request and evidence:
${text}`;
}
export {
  M365_DEFAULT_VARIANTS,
  M365_EDU_OVERRIDES,
  M365_ENTERPRISE_OVERRIDES,
  M365_INDIVIDUAL_DEFAULTS,
  M365_OAUTH_CLIENT_ID,
  M365_OAUTH_SCOPE,
  M365_REFRESH_LEAD_MS,
  buildPrompt,
  buildRouterPrompt,
  buildWsUrl,
  currentM365AccessToken,
  currentM365ChathubPath,
  decodeJwtClaims,
  extractToolSpec,
  flattenMessages,
  newChatSessionId,
  redactWsUrl,
  refreshM365AccessToken,
  resolveConnectionParams,
  tokenNeedsRefresh
};
