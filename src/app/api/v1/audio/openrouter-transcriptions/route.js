import { handleOpenRouterTranscriptionRequest } from "@/sse/handlers/mediaAudio.js";

// Allow large audio uploads — 5min for processing large files
export const maxDuration = 300;

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
 * POST /v1/audio/openrouter-transcriptions - OpenRouter-hosted STT.
 *
 * Unlike the generic /v1/audio/transcriptions route (whisper-style multipart
 * upload), OpenRouter's transcription API accepts a JSON body with a base64
 * `input_audio` payload. The ported `handleOpenRouterTranscription` handler
 * implements that contract; this route resolves the OpenRouter provider config
 * and credentialed fallback loop for it (see mediaAudio.js).
 */
export async function POST(request) {
  return await handleOpenRouterTranscriptionRequest(request);
}
