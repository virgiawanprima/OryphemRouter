import { Buffer } from "node:buffer";
import { buildAuthHeaders } from "../utils/omni/registryUtils.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { upstreamErrorResponse } from "./audioTranscription.js";
function resolveOpenRouterAudioFormat(file) {
  const fileName = typeof file.name === "string" ? file.name.toLowerCase() : "";
  const extension = fileName.includes(".") ? fileName.split(".").pop() || "" : "";
  if (extension === "opus") return "ogg";
  if (["wav", "mp3", "flac", "m4a", "ogg", "webm", "aac"].includes(extension)) {
    return extension;
  }
  const mimeFormats = {
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
    "audio/x-flac": "flac",
    "audio/mp4": "m4a",
    "audio/ogg": "ogg",
    "audio/opus": "ogg",
    "audio/webm": "webm",
    "audio/aac": "aac"
  };
  const mimeType = (file.type || "").split(";")[0].trim().toLowerCase();
  return mimeFormats[mimeType] || "wav";
}
async function handleOpenRouterTranscription(provider, file, model, token, formData) {
  const body = {
    model,
    input_audio: {
      data: Buffer.from(await file.arrayBuffer()).toString("base64"),
      format: resolveOpenRouterAudioFormat(file)
    }
  };
  const language = formData.get("language");
  if (language !== null) body.language = String(language);
  const responseFormat = formData.get("response_format");
  if (responseFormat !== null) body.response_format = String(responseFormat);
  const temperature = formData.get("temperature");
  if (temperature !== null) {
    const parsed = Number.parseFloat(String(temperature));
    if (!Number.isNaN(parsed)) body.temperature = parsed;
  }
  const granularities = formData.getAll("timestamp_granularities[]");
  if (granularities.length > 0) {
    body.timestamp_granularities = granularities.map(String);
  }
  try {
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: { ...buildAuthHeaders(provider, token), "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (!res.ok) return upstreamErrorResponse(res, await res.text());
    return new Response(await res.text(), {
      status: res.status,
      headers: { "Content-Type": res.headers.get("content-type") || "application/json" }
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return errorResponse(500, `Transcription request failed: ${error.message}`);
  }
}
export {
  handleOpenRouterTranscription,
  resolveOpenRouterAudioFormat
};
