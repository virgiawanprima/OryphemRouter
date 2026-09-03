import { handleModerationRequest } from "../../../../sse/handlers/mediaModeration.js";

/**
 * Handle CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/**
 * POST /v1/moderations - OpenAI-compatible moderations endpoint
 */
export async function POST(request) {
  return await handleModerationRequest(request);
}
