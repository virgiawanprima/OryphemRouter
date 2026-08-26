import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";

let initialized = false;

/**
 * Initialize translators once
 */
async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    }
  });
}

/**
 * Dashboard chat completions — used by the built-in Basic Chat page.
 * Same handler as /v1/chat/completions but scoped under /api/dashboard so it
 * follows the dashboard auth gate (requireLogin) instead of the LLM API-key gate.
 * The dashboard gate already authenticated the caller, so we skip the router
 * API-key requirement — Basic Chat uses the configured provider credentials.
 */
export async function POST(request) {
  await ensureInitialized();
  return await handleChat(request, null, { skipApiKeyCheck: true });
}
