import { handleRerankRequest } from "@/sse/handlers/mediaRerank.js";

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
 * POST /v1/rerank - OpenAI-compatible rerank endpoint
 */
export async function POST(request) {
  return await handleRerankRequest(request);
}
