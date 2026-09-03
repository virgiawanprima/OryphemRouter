import { Buffer } from "node:buffer";
// NOTE: pure audio helpers ported from OmniRoute executors/vertexMedia.ts live
// in utils/omni/geminiTtsAudio.js (vertexMedia.js is stubbed in OryphemRouter).
import { extractInlineAudio, parsePcmSampleRate, pcmToWav } from "../utils/omni/geminiTtsAudio.js";
import { CORS_HEADERS } from "../utils/omni/cors.js";
import { upstreamErrorResponse } from "../utils/omni/audioResponse.js";
import { errorResponse } from "../utils/errorSanitize.js";
class GeminiTtsUpstreamError extends Error {
  constructor(response, body) {
    super(`Gemini TTS upstream error (${response.status})`);
    this.response = response;
    this.body = body;
  }
}
async function geminiGenerateSpeech(credentials, options) {
  const headers = { "Content-Type": "application/json" };
  if (credentials.apiKey) {
    headers["x-goog-api-key"] = credentials.apiKey;
  } else if (credentials.accessToken) {
    headers.Authorization = `Bearer ${credentials.accessToken}`;
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(options.model)}:generateContent`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        contents: [{ parts: [{ text: options.text }] }],
        generationConfig: {
          responseModalities: ["AUDIO"],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: options.voice }
            }
          }
        }
      })
    }
  );
  if (!response.ok) {
    throw new GeminiTtsUpstreamError(response, await response.text());
  }
  const inline = extractInlineAudio(await response.json());
  if (!inline) throw new Error("Gemini TTS response did not contain audio data");
  return pcmToWav(Buffer.from(inline.base64, "base64"), parsePcmSampleRate(inline.mimeType));
}
async function handleGeminiTtsSpeech(credentials, options) {
  try {
    const wav = await geminiGenerateSpeech(credentials, {
      model: options.model,
      text: options.text,
      voice: typeof options.voice === "string" && options.voice.trim() ? options.voice.trim() : "Kore"
    });
    return new Response(new Uint8Array(wav), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "audio/wav" }
    });
  } catch (error) {
    if (error instanceof GeminiTtsUpstreamError) {
      return upstreamErrorResponse(error.response, error.body);
    }
    const message = error instanceof Error ? error.message : String(error);
    return errorResponse(500, `Speech request failed: ${message}`);
  }
}
export {
  GeminiTtsUpstreamError,
  geminiGenerateSpeech,
  handleGeminiTtsSpeech
};
