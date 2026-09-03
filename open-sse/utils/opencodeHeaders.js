import { randomUUID } from "crypto";
import { setUserAgentHeader } from "./omni/baseHeaders.js";
import { generateSessionId } from "./omni/sessionManager.js";
const OPENCODE_HEADER_KEYS = [
  "x-opencode-session",
  "x-opencode-request",
  "x-opencode-project",
  "x-opencode-client"
];
const AGENT_METADATA_HEADER_KEYS = ["x-session-id", "x-title"];
function findHeader(headers, name) {
  return Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())?.[1];
}
function forwardOpencodeClientHeaders(headers, clientHeaders, options) {
  const clientUA = clientHeaders["User-Agent"] || clientHeaders["user-agent"];
  if (clientUA) {
    setUserAgentHeader(headers, clientUA);
  }
  for (const headerName of OPENCODE_HEADER_KEYS) {
    const value = findHeader(clientHeaders, headerName);
    if (value) {
      headers[headerName] = value;
    }
  }
  for (const headerName of AGENT_METADATA_HEADER_KEYS) {
    const value = findHeader(clientHeaders, headerName);
    if (value) {
      headers[headerName] = value;
    }
  }
  if (options?.synthesizeRequestId && !headers["x-opencode-session"]) {
    const sessionAffinity = findHeader(clientHeaders, "x-session-affinity") || findHeader(clientHeaders, "x-session-id");
    if (sessionAffinity) {
      headers["x-opencode-session"] = sessionAffinity;
      if (!headers["x-opencode-request"]) {
        headers["x-opencode-request"] = randomUUID();
      }
    }
  }
  if (options?.cliDefaults) {
    applyCliDefaults(headers, options.cliDefaults, options.sessionBody);
  }
}
function applyCliDefaults(headers, cliDefaults, sessionBody) {
  const existingUa = headers["User-Agent"] || headers["user-agent"];
  const clientUaIsCliLike = typeof existingUa === "string" && /^opencode-cli\//i.test(existingUa.trim());
  if (!clientUaIsCliLike) {
    setUserAgentHeader(headers, cliDefaults.userAgent);
  }
  headers["x-opencode-client"] ||= cliDefaults.client;
  headers["x-opencode-project"] ||= cliDefaults.project;
  headers["x-opencode-request"] ||= randomUUID();
  headers["x-opencode-session"] ||= generateSessionId(sessionBody ?? null) || randomUUID();
}
export {
  forwardOpencodeClientHeaders
};
