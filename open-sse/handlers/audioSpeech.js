import { CORS_HEADERS } from "../utils/omni/cors.js";
import { stripTrailingSlashes } from "../utils/omni/urlSanitize.js";
import { getSpeechProvider, parseSpeechModel } from "../utils/omni/audioRegistry.js";
import { buildAuthHeaders } from "../utils/omni/registryUtils.js";
import { kieExecutor } from "../utils/omni/kie.js";
import { vertexGenerateSpeech } from "../utils/omni/vertexMedia.js";
import { handleGeminiTtsSpeech } from "../utils/omni/geminiTts.js";
import { handleAwsPollySpeech } from "../utils/omni/awsPollyTts.js";
import { handleEdgeTtsSpeech } from "../utils/omni/edgeTts.js";
import { GttsUpstreamError, normalizeGttsLang, synthesizeGtts } from "../utils/omni/gtts.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { resolveElevenLabsVoiceId } from "./elevenLabsVoiceMap.js";
import { audioStreamResponse, upstreamErrorResponse } from "../utils/omni/audioResponse.js";
import {
  getKieCallbackUrl,
  getKieErrorMessage,
  getKieErrorStatus,
  isJsonObject,
  parseKieResultJson
} from "../utils/omni/kieTask.js";
function normalizeKieElevenLabsVoice(voice) {
  const value = typeof voice === "string" ? voice.trim() : "";
  const aliases = {
    alloy: "Rachel",
    echo: "Adam",
    fable: "Brian",
    onyx: "Antoni",
    nova: "Bella",
    shimmer: "Dorothy"
  };
  return aliases[value.toLowerCase()] || value || "Rachel";
}
function findAudioUrlDeep(value) {
  if (!value) return null;
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value) && !/\.(jpg|jpeg|png|webp|gif|svg)(\?|$)/i.test(value)) {
      return value;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const url = findAudioUrlDeep(item);
      if (url) return url;
    }
    return null;
  }
  if (isJsonObject(value)) {
    const preferredKeys = [
      "audio_url",
      "audioUrl",
      "stream_audio_url",
      "streamAudioUrl",
      "resultUrl",
      "url",
      "downloadUrl",
      "resultUrls"
    ];
    for (const key of preferredKeys) {
      const url = findAudioUrlDeep(value[key]);
      if (url) return url;
    }
    for (const item of Object.values(value)) {
      const url = findAudioUrlDeep(item);
      if (url) return url;
    }
  }
  return null;
}
function findKieAudioUrl(recordData) {
  const record = isJsonObject(recordData) ? recordData : {};
  const data = isJsonObject(record.data) ? record.data : {};
  const resultJson = parseKieResultJson(recordData);
  const response = data.response;
  const nestedData = data.data;
  const candidates = [
    response,
    data,
    resultJson,
    ...Array.isArray(response) ? response : [],
    ...Array.isArray(nestedData) ? nestedData : [],
    ...Array.isArray(resultJson.data) ? resultJson.data : [],
    ...Array.isArray(resultJson.result) ? resultJson.result : []
  ];
  for (const item of candidates) {
    const url = findAudioUrlDeep(item);
    if (url) {
      return url;
    }
  }
  return null;
}
function isValidPathSegment(segment) {
  return !segment.includes("..") && !segment.includes("//");
}
function getStringValue(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function getProviderSpecificData(credentials) {
  return credentials?.providerSpecificData && typeof credentials.providerSpecificData === "object" && !Array.isArray(credentials.providerSpecificData) ? credentials.providerSpecificData : {};
}
function normalizeXiaomiMimoSpeechUrl(baseUrl) {
  const configured = getStringValue(baseUrl) || "https://api.xiaomimimo.com/v1";
  const normalized = stripTrailingSlashes(configured).replace(/\/chat\/completions$/i, "");
  return `${normalized}/chat/completions`;
}
function normalizeXiaomiMimoMimeType(format) {
  switch (getStringValue(format)?.toLowerCase()) {
    case void 0:
    case null:
    case "mp3":
    case "audio/mp3":
    case "audio/mpeg":
      return "audio/mpeg";
    case "wav":
    case "audio/wav":
      return "audio/wav";
    default:
      return null;
  }
}
function getXiaomiMimoAudioData(data) {
  const messageAudio = data?.choices?.[0]?.message?.audio;
  const directAudio = data?.audio || data?.output_audio;
  const firstDataItem = Array.isArray(data?.data) ? data.data[0] : null;
  return getStringValue(messageAudio?.data) || getStringValue(messageAudio?.b64_json) || getStringValue(directAudio?.data) || getStringValue(directAudio?.b64_json) || getStringValue(firstDataItem?.b64_json) || getStringValue(firstDataItem?.audio) || getStringValue(data?.audioContent) || getStringValue(data?.audio_content);
}
async function handleHyperbolicSpeech(providerConfig, body, token) {
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({ text: body.input })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const data = await res.json();
  const audioBuffer = Uint8Array.from(atob(data.audio), (c) => c.charCodeAt(0));
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": "audio/mpeg"
    }
  });
}
async function handleDeepgramSpeech(providerConfig, body, modelId, token) {
  const url = new URL(providerConfig.baseUrl);
  url.searchParams.set("model", modelId);
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({ text: body.input })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res);
}
function normalizeSpeechResponseFormat(fmt) {
  if (typeof fmt !== "string" || !fmt) return "mp3";
  const lower = fmt.toLowerCase();
  return lower === "ogg" ? "opus" : lower;
}
async function handleSonioxSpeech(providerConfig, body, modelId, token) {
  const fmt = typeof body.response_format === "string" ? body.response_format : "mp3";
  const audioFormat = fmt === "pcm" ? "pcm_s16le" : fmt;
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({
      text: body.input,
      model: modelId,
      ...body.voice ? { voice: body.voice } : {},
      audio_format: audioFormat
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const contentType = fmt === "wav" ? "audio/wav" : fmt === "opus" ? "audio/opus" : "audio/mpeg";
  return audioStreamResponse(res, contentType);
}
async function handleElevenLabsSpeech(providerConfig, body, modelId, token) {
  if (typeof body.voice === "string" && !isValidPathSegment(body.voice)) {
    return errorResponse(400, "Invalid voice ID");
  }
  const voiceId = resolveElevenLabsVoiceId(body.voice);
  if (!voiceId) {
    return errorResponse(
      400,
      "Unknown ElevenLabs voice. Provide a real ElevenLabs voice_id, a supported OpenAI voice name (alloy, echo, fable, onyx, nova, shimmer), or a known ElevenLabs display name."
    );
  }
  if (!isValidPathSegment(voiceId)) {
    return errorResponse(400, "Invalid voice ID");
  }
  const url = `${providerConfig.baseUrl}/${voiceId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({
      text: body.input,
      model_id: modelId
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res);
}
async function handleNvidiaTtsSpeech(providerConfig, body, modelId, token) {
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({
      input: { text: body.input },
      voice: body.voice || "default",
      model: modelId
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res, "audio/wav");
}
async function handleHuggingFaceTtsSpeech(providerConfig, body, modelId, token) {
  if (!isValidPathSegment(modelId)) {
    return errorResponse(400, "Invalid model ID");
  }
  const url = `${providerConfig.baseUrl}/${modelId}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({ inputs: body.input })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res, "audio/wav");
}
const INWORLD_AUDIO_FORMATS = {
  mp3: { audioEncoding: "MP3", mimeType: "audio/mpeg" },
  wav: { audioEncoding: "WAV", mimeType: "audio/wav" },
  opus: { audioEncoding: "OPUS", mimeType: "audio/opus" },
  pcm: { audioEncoding: "PCM", mimeType: "audio/pcm" }
};
async function handleInworldSpeech(providerConfig, body, modelId, token) {
  const requestedFormat = typeof body.response_format === "string" ? body.response_format.toLowerCase() : "mp3";
  const audioFormat = INWORLD_AUDIO_FORMATS[requestedFormat];
  if (!audioFormat) {
    return errorResponse(400, "Inworld TTS supports response_format mp3, wav, opus, or pcm only");
  }
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${token}`
    },
    body: JSON.stringify({
      text: body.input,
      voiceId: body.voice || void 0,
      modelId,
      audioConfig: {
        audioEncoding: audioFormat.audioEncoding
      }
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const data = await res.json();
  const audioBuffer = Uint8Array.from(atob(data.audioContent ?? ""), (c) => c.charCodeAt(0));
  const mimeType = typeof data.contentType === "string" && data.contentType ? data.contentType : audioFormat.mimeType;
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      "Content-Type": mimeType
    }
  });
}
async function handleCartesiaSpeech(providerConfig, body, modelId, token) {
  const outputFormat = body.response_format === "wav" ? { container: "wav", sample_rate: 44100 } : { container: "mp3", bit_rate: 128e3, sample_rate: 44100 };
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": token,
      "Cartesia-Version": "2024-06-10"
    },
    body: JSON.stringify({
      model_id: modelId,
      transcript: body.input,
      ...body.voice ? { voice: { mode: "id", id: body.voice } } : {},
      output_format: outputFormat
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res);
}
async function handleFishAudioSpeech(providerConfig, body, modelId, token) {
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      model: modelId
    },
    body: JSON.stringify({
      text: body.input,
      format: body.response_format || "mp3",
      ...body.voice ? { reference_id: body.voice } : {},
      ...body.speed ? { prosody: { speed: body.speed } } : {}
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res);
}
async function handlePlayHtSpeech(providerConfig, body, modelId, token) {
  const [userId, apiKey] = (token || ":").split(":");
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
      "X-USER-ID": userId || "",
      Authorization: `Bearer ${apiKey || token}`
    },
    body: JSON.stringify({
      text: body.input,
      voice: body.voice || "s3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json",
      voice_engine: modelId || "PlayDialog",
      output_format: body.response_format || "mp3",
      speed: body.speed || 1
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  return audioStreamResponse(res);
}
async function handleKieAudioSpeech(providerConfig, body, modelId, token) {
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const voice = normalizeKieElevenLabsVoice(body.voice);
  const payload = {
    model: modelId,
    callBackUrl: getKieCallbackUrl(body),
    input: {
      text: body.input,
      voice,
      stability: typeof body.stability === "number" ? body.stability : 0.5,
      similarity_boost: typeof body.similarity_boost === "number" ? body.similarity_boost : 0.75,
      style: typeof body.style === "number" ? body.style : 0,
      speed: typeof body.speed === "number" ? body.speed : 1,
      timestamps: body.timestamps === true,
      previous_text: body.previous_text || "",
      next_text: body.next_text || "",
      language_code: body.language_code || ""
    }
  };
  let data;
  try {
    data = await kieExecutor.createTask({
      baseUrl,
      token,
      payload
    });
  } catch (err) {
    const status = getKieErrorStatus(err, 502);
    return Response.json(
      {
        error: { message: getKieErrorMessage(err, "Kie audio createTask failed"), code: status }
      },
      {
        status,
        headers: { ...CORS_HEADERS }
      }
    );
  }
  const taskId = data?.data?.taskId || data?.taskId;
  if (taskId) {
    return pollKieAudioResult(baseUrl, modelId, taskId, token);
  }
  const audioUrl = findKieAudioUrl(data);
  if (typeof audioUrl === "string" && audioUrl.length > 0) {
    const audioRes = await fetch(audioUrl);
    return audioStreamResponse(audioRes);
  }
  return errorResponse(
    502,
    data?.msg || data?.message || "Kie audio generation did not return taskId or audio URL"
  );
}
async function pollKieAudioResult(baseUrl, modelId, taskId, token) {
  void modelId;
  const statusUrl = kieExecutor.getTaskStatusUrl(baseUrl);
  try {
    const { data, state } = await kieExecutor.pollTask({
      statusUrl,
      taskId: String(taskId),
      token,
      timeoutMs: 6e4,
      pollIntervalMs: 2e3
    });
    if (state === "success") {
      const url = findKieAudioUrl(data);
      if (url) {
        const audioRes = await fetch(url);
        return audioStreamResponse(audioRes);
      }
      return errorResponse(502, "Kie audio task completed without audio URL");
    }
  } catch (err) {
    return errorResponse(
      getKieErrorStatus(err, 504),
      getKieErrorMessage(err, "Kie audio generation timed out or failed")
    );
  }
  return errorResponse(504, "Kie audio generation timed out or failed");
}
async function handleXiaomiMimoSpeech(providerConfig, body, modelId, token, credentials) {
  const providerSpecificData = getProviderSpecificData(credentials);
  const url = normalizeXiaomiMimoSpeechUrl(providerSpecificData.baseUrl || providerConfig.baseUrl);
  const audioMimeType = normalizeXiaomiMimoMimeType(body.response_format);
  if (!audioMimeType) {
    return errorResponse(400, "Xiaomi MiMo TTS supports response_format mp3 or wav only");
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({
      model: modelId,
      messages: [{ role: "assistant", content: body.input }],
      audio: {
        format: audioMimeType,
        voice: body.voice || getStringValue(providerSpecificData.defaultVoice) || "mimo_default"
      }
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const contentType = res.headers.get("content-type") || "";
  if (contentType.startsWith("audio/")) {
    return audioStreamResponse(res, audioMimeType);
  }
  const data = await res.json();
  const audioBase64 = getXiaomiMimoAudioData(data);
  if (!audioBase64) {
    return errorResponse(502, "Xiaomi MiMo TTS response did not contain audio data");
  }
  const audioBuffer = Uint8Array.from(atob(audioBase64), (c) => c.charCodeAt(0));
  return new Response(audioBuffer, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": audioMimeType
    }
  });
}
function hexToBytes(audioHex) {
  const clean = typeof audioHex === "string" ? audioHex.trim() : "";
  if (!clean) throw new Error("MiniMax TTS returned no audio");
  if (clean.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(clean)) {
    throw new Error("MiniMax TTS returned invalid audio");
  }
  const len = clean.length / 2;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return out;
}
async function handleMinimaxSpeech(providerConfig, body, modelId, token) {
  const voiceId = typeof body.voice === "string" && body.voice || "English_expressive_narrator";
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...buildAuthHeaders(providerConfig, token)
    },
    body: JSON.stringify({
      model: modelId || "speech-2.8-hd",
      text: body.input,
      stream: false,
      language_boost: "auto",
      output_format: "hex",
      voice_setting: {
        voice_id: voiceId,
        speed: typeof body.speed === "number" ? body.speed : 1,
        vol: 1,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32e3,
        bitrate: 128e3,
        format: "mp3",
        channel: 1
      }
    })
  });
  const rawText = await res.text();
  let data = {};
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText);
      if (parsed && typeof parsed === "object") data = parsed;
    } catch {
      data = {};
    }
  }
  if (!res.ok) {
    return upstreamErrorResponse(res, rawText);
  }
  const baseResp = data.base_resp || data.baseResp || {};
  const statusCode = Number(baseResp.status_code ?? baseResp.statusCode ?? 0);
  const statusMessage = String(baseResp.status_msg || baseResp.statusMsg || data.message || "");
  if (statusCode !== 0) {
    return errorResponse(502, `MiniMax TTS: ${statusMessage || "upstream error"}`);
  }
  const audioField = data.data?.audio;
  let bytes;
  try {
    bytes = hexToBytes(audioField);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "invalid audio";
    return errorResponse(502, `MiniMax TTS: ${msg}`);
  }
  return new Response(bytes, {
    status: 200,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "audio/mpeg"
    }
  });
}
async function handleCoquiSpeech(providerConfig, body) {
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: body.input,
      speaker_id: body.voice || void 0
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const contentType = res.headers.get("content-type") || "audio/wav";
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType
    }
  });
}
async function handleTortoiseSpeech(providerConfig, body) {
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: body.input,
      voice: body.voice || "random"
    })
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const contentType = res.headers.get("content-type") || "audio/wav";
  return new Response(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType
    }
  });
}
async function handleGttsSpeech(body) {
  try {
    const audio = await synthesizeGtts({
      text: body.input,
      lang: normalizeGttsLang(body.voice)
    });
    return new Response(audio, {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "audio/mpeg" }
    });
  } catch (err) {
    const status = err instanceof GttsUpstreamError ? err.status : 502;
    const message = err instanceof Error ? err.message : "gTTS synthesis failed";
    return errorResponse(status, message);
  }
}
async function handleAudioSpeech({
  body,
  credentials,
  resolvedProvider = null,
  resolvedModel = null,
  clientIp = null
}) {
  if (!body.model) {
    return errorResponse(400, "model is required");
  }
  if (!body.input) {
    return errorResponse(400, "input is required");
  }
  let providerConfig = resolvedProvider;
  let modelId = resolvedModel;
  if (!providerConfig) {
    const parsed = parseSpeechModel(body.model);
    providerConfig = parsed.provider ? getSpeechProvider(parsed.provider) : null;
    modelId = parsed.model;
  }
  if (!providerConfig) {
    return errorResponse(
      400,
      `No speech provider found for model "${body.model}". Use format provider/model. Available: openai, hyperbolic, deepgram, nvidia, elevenlabs, huggingface, inworld, cartesia, fishaudio, playht, kie, aws-polly, xiaomi-mimo, edgetts, gtts, coqui, tortoise, qwen`
    );
  }
  const token = providerConfig.authType === "none" ? null : credentials?.apiKey || credentials?.accessToken;
  if (providerConfig.authType !== "none" && !token) {
    return errorResponse(401, `No credentials for speech provider: ${providerConfig.id}`);
  }
  try {
    if (providerConfig.format === "vertex-gemini-tts") {
      const { audio, contentType } = await vertexGenerateSpeech(credentials, {
        model: modelId,
        input: body.input,
        voice: body.voice
      });
      return new Response(audio, {
        status: 200,
        headers: { ...CORS_HEADERS, "Content-Type": contentType }
      });
    }
    if (providerConfig.format === "gemini-tts") {
      return handleGeminiTtsSpeech(credentials, {
        model: modelId,
        text: body.input,
        voice: body.voice
      });
    }
    if (providerConfig.format === "hyperbolic") {
      return handleHyperbolicSpeech(providerConfig, body, token);
    }
    if (providerConfig.format === "deepgram") {
      return handleDeepgramSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "soniox-tts") {
      return handleSonioxSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "elevenlabs") {
      return handleElevenLabsSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "nvidia-tts") {
      return handleNvidiaTtsSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "huggingface-tts") {
      return handleHuggingFaceTtsSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "inworld") {
      return handleInworldSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "cartesia") {
      return handleCartesiaSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "fishaudio") {
      return handleFishAudioSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "playht") {
      return handlePlayHtSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "kie-audio") {
      return handleKieAudioSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "aws-polly") {
      return handleAwsPollySpeech(providerConfig, body, modelId, token, credentials);
    }
    if (providerConfig.format === "edgetts") {
      return handleEdgeTtsSpeech(body, clientIp);
    }
    if (providerConfig.format === "gtts") {
      return handleGttsSpeech(body);
    }
    if (providerConfig.format === "xiaomi-mimo-tts") {
      return handleXiaomiMimoSpeech(providerConfig, body, modelId, token, credentials);
    }
    if (providerConfig.format === "minimax-tts") {
      return handleMinimaxSpeech(providerConfig, body, modelId, token);
    }
    if (providerConfig.format === "coqui") {
      return handleCoquiSpeech(providerConfig, body);
    }
    if (providerConfig.format === "tortoise") {
      return handleTortoiseSpeech(providerConfig, body);
    }
    const res = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...buildAuthHeaders(providerConfig, token)
      },
      body: JSON.stringify({
        model: modelId,
        input: body.input,
        voice: body.voice || "alloy",
        response_format: normalizeSpeechResponseFormat(body.response_format),
        speed: body.speed || 1
      })
    });
    if (!res.ok) {
      return upstreamErrorResponse(res, await res.text());
    }
    return audioStreamResponse(res);
  } catch (err) {
    return errorResponse(500, `Speech request failed: ${err.message}`);
  }
}
export {
  handleAudioSpeech,
  normalizeSpeechResponseFormat
};
