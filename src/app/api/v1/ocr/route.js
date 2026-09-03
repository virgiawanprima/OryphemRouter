import { handleOcrRequest } from "@/sse/handlers/mediaOcr.js";

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
    },
  });
}

/** POST /v1/ocr - OCR endpoint */
export async function POST(request) {
  return await handleOcrRequest(request);
}
