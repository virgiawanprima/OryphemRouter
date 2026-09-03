import { handleImageUpscaleRequest } from "@/sse/handlers/mediaUpscale.js";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/** POST /v1/images/upscale - OpenAI-compatible image upscale endpoint */
export async function POST(request) {
  return await handleImageUpscaleRequest(request);
}
