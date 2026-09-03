import { saveCallLog } from "../../utils/omni/usageDb.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
const AUDIO_FORMATS = /* @__PURE__ */ new Set(["mp3", "wav", "pcm"]);
const OUTPUT_FORMATS = /* @__PURE__ */ new Set(["url", "hex"]);
const DEFAULT_AUDIO_FORMAT = "mp3";
const STATUS_IN_PROGRESS = 1;
const STRING_REQUEST_FIELDS = [
  "prompt",
  "lyrics",
  "audio_url",
  "audio_base64",
  "cover_feature_id"
];
function isRecord(value) {
  return typeof value === "object" && value !== null;
}
function stringValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : void 0;
}
function numberValue(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : void 0;
}
function booleanValue(value) {
  return typeof value === "boolean" ? value : void 0;
}
function logMinimaxMusicCall(params) {
  saveCallLog({
    method: "POST",
    path: "/v1/music/generations",
    ...params
  }).catch(() => {
  });
}
function resolveEndpoint(providerConfig, credentials) {
  const psd = credentials?.providerSpecificData;
  const override = isRecord(psd) ? stringValue(psd.baseUrl) : void 0;
  return override || providerConfig.baseUrl;
}
function isRegionalEndpoint(endpoint, regionalBaseUrl) {
  if (!regionalBaseUrl) return false;
  try {
    return new URL(endpoint).host === new URL(regionalBaseUrl).host;
  } catch {
    return false;
  }
}
function buildAudioSetting(body) {
  const provided = isRecord(body.audio_setting) ? body.audio_setting : {};
  const setting = {};
  const sampleRate = numberValue(provided.sample_rate);
  if (sampleRate !== void 0) setting.sample_rate = sampleRate;
  const bitrate = numberValue(provided.bitrate);
  if (bitrate !== void 0) setting.bitrate = bitrate;
  const format = stringValue(provided.format)?.toLowerCase();
  if (format && AUDIO_FORMATS.has(format)) setting.format = format;
  return Object.keys(setting).length > 0 ? setting : void 0;
}
function resolveAudioFormat(body) {
  const provided = isRecord(body.audio_setting) ? body.audio_setting : {};
  const format = stringValue(provided.format)?.toLowerCase();
  return format && AUDIO_FORMATS.has(format) ? format : DEFAULT_AUDIO_FORMAT;
}
function resolveOutputFormat(body) {
  const requested = stringValue(body.output_format)?.toLowerCase();
  return requested && OUTPUT_FORMATS.has(requested) ? requested : "url";
}
function buildUpstreamBody(model, body, regional) {
  const request = {
    model,
    stream: false,
    output_format: resolveOutputFormat(body)
  };
  for (const field of STRING_REQUEST_FIELDS) {
    const value = stringValue(body[field]);
    if (value !== void 0) request[field] = value;
  }
  const audioSetting = buildAudioSetting(body);
  if (audioSetting) request.audio_setting = audioSetting;
  const lyricsOptimizer = booleanValue(body.lyrics_optimizer);
  if (lyricsOptimizer !== void 0) request.lyrics_optimizer = lyricsOptimizer;
  const isInstrumental = booleanValue(body.is_instrumental) ?? booleanValue(body.instrumental);
  if (isInstrumental !== void 0) request.is_instrumental = isInstrumental;
  if (regional) {
    const watermark = booleanValue(body.aigc_watermark);
    if (watermark !== void 0) request.aigc_watermark = watermark;
  }
  return request;
}
async function readPayload(response) {
  const rawText = await response.text();
  if (!rawText) return {};
  try {
    const parsed = JSON.parse(rawText);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
function hexAudioToBase64(audioHex) {
  if (audioHex.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(audioHex)) {
    throw new Error("MiniMax music generation returned invalid hex audio");
  }
  return Buffer.from(audioHex, "hex").toString("base64");
}
function readEnvelopeError(payload) {
  const baseResp = isRecord(payload.base_resp) ? payload.base_resp : {};
  const statusCode = numberValue(baseResp.status_code);
  if (statusCode === void 0 || statusCode === 0) return void 0;
  return stringValue(baseResp.status_msg) || `upstream status code ${statusCode}`;
}
async function handleMinimaxMusicGeneration({
  model,
  provider,
  providerConfig,
  body,
  credentials,
  log
}) {
  const startTime = Date.now();
  const token = stringValue(credentials?.apiKey) || stringValue(credentials?.accessToken);
  if (!token) {
    return { success: false, status: 401, error: "MiniMax API key is required" };
  }
  const modelId = stringValue(model);
  if (!modelId) {
    return { success: false, status: 400, error: "MiniMax music model is required" };
  }
  const endpoint = resolveEndpoint(providerConfig, credentials);
  const upstreamBody = buildUpstreamBody(
    modelId,
    body,
    isRegionalEndpoint(endpoint, providerConfig.regionalBaseUrl)
  );
  const audioFormat = resolveAudioFormat(body);
  const modelLabel = `${provider}/${modelId}`;
  log?.info?.(
    "MUSIC",
    `${modelLabel} (minimax-music) | prompt: "${String(body.prompt ?? "").slice(0, 60)}..." | output_format: ${upstreamBody.output_format} | audio_format: ${audioFormat}`
  );
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(upstreamBody)
    });
    const payload = await readPayload(response);
    if (!response.ok) {
      const errorMessage = readEnvelopeError(payload) || `MiniMax music generation failed (${response.status})`;
      log?.error?.("MUSIC", `${provider} minimax-music error ${response.status}: ${errorMessage}`);
      logMinimaxMusicCall({
        status: response.status,
        model: modelLabel,
        provider,
        duration: Date.now() - startTime,
        error: errorMessage,
        requestBody: upstreamBody
      });
      return { success: false, status: response.status, error: errorMessage };
    }
    const envelopeError = readEnvelopeError(payload);
    if (envelopeError) {
      log?.error?.("MUSIC", `${provider} minimax-music rejected the request: ${envelopeError}`);
      logMinimaxMusicCall({
        status: 502,
        model: modelLabel,
        provider,
        duration: Date.now() - startTime,
        error: envelopeError,
        requestBody: upstreamBody
      });
      return { success: false, status: 502, error: envelopeError };
    }
    const data = isRecord(payload.data) ? payload.data : {};
    if (numberValue(data.status) === STATUS_IN_PROGRESS) {
      const pending = "MiniMax music generation is still in progress; retry the request";
      logMinimaxMusicCall({
        status: 502,
        model: modelLabel,
        provider,
        duration: Date.now() - startTime,
        error: pending
      });
      return { success: false, status: 502, error: pending };
    }
    const audio = stringValue(data.audio);
    if (!audio) {
      const errorMessage = "MiniMax music generation returned no audio";
      logMinimaxMusicCall({
        status: 502,
        model: modelLabel,
        provider,
        duration: Date.now() - startTime,
        error: errorMessage
      });
      return { success: false, status: 502, error: errorMessage };
    }
    const track = upstreamBody.output_format === "hex" ? { b64_json: hexAudioToBase64(audio), format: audioFormat } : { url: audio, format: audioFormat };
    logMinimaxMusicCall({
      status: 200,
      model: modelLabel,
      provider,
      duration: Date.now() - startTime,
      responseBody: { audio_count: 1 }
    });
    return {
      success: true,
      data: { created: Math.floor(Date.now() / 1e3), data: [track] }
    };
  } catch (err) {
    const errorMessage = sanitizeErrorMessage(err) || "Music provider error";
    log?.error?.("MUSIC", `${provider} minimax-music error: ${errorMessage}`);
    logMinimaxMusicCall({
      status: 502,
      model: modelLabel,
      provider,
      duration: Date.now() - startTime,
      error: errorMessage
    });
    return { success: false, status: 502, error: errorMessage };
  }
}
export {
  handleMinimaxMusicGeneration
};
