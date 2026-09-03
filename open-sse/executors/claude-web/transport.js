import { FETCH_TIMEOUT_MS } from "../executorConstants.js";
import {
  tlsFetchClaude
} from "../../services/claudeTlsClient.js";
const MAX_ERROR_BODY_BYTES = 64 * 1024;
const defaultDeps = {
  tlsFetch: tlsFetchClaude
};
function expectedRequestUrl(request) {
  return `https://claude.ai/api/organizations/${encodeURIComponent(request.organizationId)}/chat_conversations/${encodeURIComponent(request.conversationId)}/${request.endpointSuffix}`;
}
async function readErrorBody(body, text) {
  if (!body) return text ?? "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let output = "";
  try {
    while (total < MAX_ERROR_BODY_BYTES) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = MAX_ERROR_BODY_BYTES - total;
      const chunk = value.byteLength > remaining ? value.slice(0, remaining) : value;
      total += chunk.byteLength;
      output += decoder.decode(chunk, { stream: total < MAX_ERROR_BODY_BYTES });
      if (chunk.byteLength < value.byteLength) break;
    }
    output += decoder.decode();
    return output;
  } finally {
    await reader.cancel().catch(() => {
    });
    try {
      reader.releaseLock();
    } catch {
    }
  }
}
function isClaudeWebChallenge(result) {
  if (result.status !== 403) return false;
  if (result.headers.get("cf-mitigated")?.toLowerCase() === "challenge") return true;
  const body = result.bodyText ?? "";
  return /<title>\s*Just a moment/i.test(body) || /<title>\s*Attention Required/i.test(body) || /\b(?:cf-chl|challenge-platform)\b/i.test(body);
}
async function sendClaudeWebDirect(request, deps = defaultDeps) {
  if (request.url !== expectedRequestUrl(request)) {
    throw new Error("Claude Web direct request endpoint does not match prepared state");
  }
  const response = await deps.tlsFetch(request.url, {
    method: "POST",
    headers: {
      ...request.headers,
      Cookie: request.cookieString
    },
    body: JSON.stringify(request.payload),
    timeoutMs: FETCH_TIMEOUT_MS,
    stream: true,
    signal: request.signal
  });
  if (response.status >= 200 && response.status < 300) {
    return {
      status: response.status,
      headers: response.headers,
      body: response.body
    };
  }
  const bodyText = await readErrorBody(response.body, response.text);
  return {
    status: response.status,
    headers: response.headers,
    body: bodyText ? new Response(bodyText).body : null,
    bodyText
  };
}
export {
  isClaudeWebChallenge,
  sendClaudeWebDirect
};
