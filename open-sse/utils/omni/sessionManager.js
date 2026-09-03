// ADAPTED STUB — ported from OmniRoute open-sse/services/sessionManager.ts
// Only `generateSessionId` is needed (by opencodeHeaders.js). Minimal self-contained
// port of the session-id fingerprint logic (no in-memory session store / TTL sweep).
import { createHash } from "node:crypto";

function hashShort(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

function extractSystemPrompt(body) {
  if (!body || typeof body !== "object") return null;
  if (body.system) {
    return typeof body.system === "string" ? body.system : JSON.stringify(body.system);
  }
  if (Array.isArray(body.messages)) {
    const sys = body.messages.find((m) => m.role === "system" || m.role === "developer");
    if (sys) {
      return typeof sys.content === "string" ? sys.content : JSON.stringify(sys.content);
    }
  }
  return null;
}

function extractFirstUserMessage(body) {
  if (!body || typeof body !== "object") return null;
  const messages = body.messages || body.input || [];
  if (!Array.isArray(messages)) return null;
  for (const msg of messages) {
    if (msg.role === "user") {
      return typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);
    }
  }
  return null;
}

/**
 * Generate a stable session ID from a request body fingerprint:
 * system prompt hash + first user message hash + model + provider + tools + connection.
 */
export function generateSessionId(body, options = {}) {
  if (!body || typeof body !== "object") return null;
  const parts = [];

  if (body.model) parts.push(`model:${body.model}`);
  if (options.provider) parts.push(`provider:${options.provider}`);

  const systemPrompt = extractSystemPrompt(body);
  if (systemPrompt) parts.push(`sys:${hashShort(systemPrompt)}`);

  const firstUser = extractFirstUserMessage(body);
  if (firstUser) parts.push(`user0:${hashShort(firstUser)}`);

  if (body.tools && Array.isArray(body.tools) && body.tools.length > 0) {
    const toolNames = body.tools
      .map((t) => t.name || t.function?.name || "")
      .filter(Boolean)
      .sort()
      .join(",");
    if (toolNames) parts.push(`tools:${hashShort(toolNames)}`);
  }

  if (options.connectionId) parts.push(`conn:${options.connectionId}`);
  if (parts.length === 0) return null;

  const fingerprint = parts.join("|");
  return createHash("sha256").update(fingerprint).digest("hex").slice(0, 16);
}
