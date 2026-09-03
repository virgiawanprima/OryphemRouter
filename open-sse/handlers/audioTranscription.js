import { CORS_HEADERS } from "../utils/omni/cors.js";
import { Buffer } from "node:buffer";
import {
  getTranscriptionProvider,
  parseTranscriptionModel
} from "../utils/omni/audioRegistry.js";
import { buildAuthHeaders } from "../utils/omni/registryUtils.js";
import { kieExecutor } from "../utils/omni/kie.js";
import { vertexTranscribe } from "../utils/omni/vertexMedia.js";
import { errorResponse } from "../utils/errorSanitize.js";
import { isJsonObject } from "../utils/omni/kieTask.js";
import { handleOpenRouterTranscription } from "./openrouterTranscription.js";
function upstreamErrorResponse(res, errText) {
  let errorMessage;
  try {
    const parsed = JSON.parse(errText);
    const raw = parsed?.err_msg || parsed?.error?.message || (typeof parsed?.error === "string" ? parsed.error : null) || parsed?.message || (typeof parsed?.detail === "string" ? parsed.detail : parsed?.detail?.message) || null;
    errorMessage = raw ? String(raw) : errText || `Upstream error (${res.status})`;
  } catch {
    errorMessage = errText || `Upstream error (${res.status})`;
  }
  return Response.json(
    { error: { message: errorMessage, code: res.status } },
    {
      status: res.status,
      headers: { ...CORS_HEADERS }
    }
  );
}
function isValidPathSegment(segment) {
  return !segment.includes("..") && !segment.includes("//");
}
function normalizeUploadExtension(name) {
  return name.replace(/\.opus$/i, ".ogg");
}
function getUploadedFileName(file) {
  return typeof file.name === "string" && file.name.length > 0 ? normalizeUploadExtension(file.name) : "audio.wav";
}
async function buildMultipartBody(file, fields, fileFieldName = "file") {
  const boundary = "----OmniRouteAudioBoundary" + Date.now().toString(36);
  const parts = [];
  const encoder = new TextEncoder();
  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      encoder.encode(
        `--${boundary}\r
Content-Disposition: form-data; name="${name}"\r
\r
${value}\r
`
      )
    );
  }
  const fileName = getUploadedFileName(file).replace(/["]/g, "_").replace(/[\r\n]/g, "_");
  const fileBytes = new Uint8Array(await file.arrayBuffer());
  parts.push(
    encoder.encode(
      `--${boundary}\r
Content-Disposition: form-data; name="${fileFieldName}"; filename="${fileName}"\r
Content-Type: ${file.type || "application/octet-stream"}\r
\r
`
    )
  );
  parts.push(fileBytes);
  parts.push(encoder.encode(`\r
--${boundary}--\r
`));
  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const body = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    body.set(part, offset);
    offset += part.length;
  }
  return { body, contentType: "multipart/form-data; boundary=" + boundary };
}
function resolveAudioContentType(file) {
  const browserType = (file.type || "").toLowerCase();
  const fileName = typeof file.name === "string" ? file.name.toLowerCase() : "";
  if (browserType.startsWith("audio/")) return browserType;
  const ext = fileName.includes(".") ? fileName.split(".").pop() : "";
  const EXT_TO_MIME = {
    mp3: "audio/mpeg",
    mp4: "audio/mp4",
    m4a: "audio/mp4",
    wav: "audio/wav",
    ogg: "audio/ogg",
    flac: "audio/flac",
    webm: "audio/webm",
    aac: "audio/aac",
    wma: "audio/x-ms-wma",
    opus: "audio/opus"
  };
  if (ext && EXT_TO_MIME[ext]) return EXT_TO_MIME[ext];
  return "application/octet-stream";
}
async function handleDeepgramTranscription(providerConfig, file, modelId, token, formData) {
  const url = new URL(providerConfig.baseUrl);
  url.searchParams.set("model", modelId);
  url.searchParams.set("smart_format", "true");
  url.searchParams.set("punctuate", "true");
  const langParam = formData?.get("language");
  if (typeof langParam === "string" && langParam.trim()) {
    url.searchParams.set("language", langParam.trim());
  } else {
    url.searchParams.set("detect_language", "true");
  }
  const arrayBuffer = await file.arrayBuffer();
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      ...buildAuthHeaders(providerConfig, token),
      "Content-Type": resolveAudioContentType(file)
    },
    body: arrayBuffer
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const data = await res.json();
  const text = data.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? null;
  return Response.json(
    { text: text ?? "", noSpeechDetected: text === null || text === "" },
    { headers: { ...CORS_HEADERS } }
  );
}
async function handleAssemblyAITranscription(providerConfig, file, modelId, token) {
  const authHeaders = buildAuthHeaders(providerConfig, token);
  const arrayBuffer = await file.arrayBuffer();
  const uploadRes = await fetch("https://api.assemblyai.com/v2/upload", {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/octet-stream"
    },
    body: arrayBuffer
  });
  if (!uploadRes.ok) {
    return upstreamErrorResponse(uploadRes, await uploadRes.text());
  }
  const { upload_url } = await uploadRes.json();
  const submitRes = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      audio_url: upload_url,
      speech_models: [modelId],
      language_detection: true
    })
  });
  if (!submitRes.ok) {
    return upstreamErrorResponse(submitRes, await submitRes.text());
  }
  const { id: transcriptId } = await submitRes.json();
  const pollUrl = `${providerConfig.baseUrl}/${transcriptId}`;
  const maxWait = 12e4;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2e3));
    const pollRes = await fetch(pollUrl, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const result = await pollRes.json();
    if (result.status === "completed") {
      return Response.json({ text: result.text || "" }, { headers: { ...CORS_HEADERS } });
    }
    if (result.status === "error") {
      return errorResponse(500, result.error || "AssemblyAI transcription failed");
    }
  }
  return errorResponse(504, "AssemblyAI transcription timed out after 120s");
}
async function handleGladiaTranscription(providerConfig, file, modelId, token) {
  const authHeaders = buildAuthHeaders(providerConfig, token);
  const { body: uploadBody, contentType: uploadCT } = await buildMultipartBody(file, {});
  const uploadRes = await fetch("https://api.gladia.io/v2/upload", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": uploadCT },
    body: uploadBody
  });
  if (!uploadRes.ok) {
    return upstreamErrorResponse(uploadRes, await uploadRes.text());
  }
  const { audio_url } = await uploadRes.json();
  const submitRes = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ audio_url, model: modelId })
  });
  if (!submitRes.ok) {
    return upstreamErrorResponse(submitRes, await submitRes.text());
  }
  const { result_url: resultUrl } = await submitRes.json();
  if (!resultUrl) {
    return errorResponse(502, "Gladia did not return a result_url");
  }
  const maxWait = 12e4;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2e3));
    const pollRes = await fetch(resultUrl, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const result = await pollRes.json();
    if (result.status === "done") {
      const text = result.result?.transcription?.full_transcript || "";
      return Response.json({ text }, { headers: { ...CORS_HEADERS } });
    }
    if (result.status === "error") {
      return errorResponse(500, result.error_code || result.error || "Gladia transcription failed");
    }
  }
  return errorResponse(504, "Gladia transcription timed out after 120s");
}
async function handleSonioxTranscription(providerConfig, file, modelId, token) {
  const authHeaders = buildAuthHeaders(providerConfig, token);
  const { body: uploadBody, contentType: uploadContentType } = await buildMultipartBody(file, {});
  const uploadRes = await fetch("https://api.soniox.com/v1/files", {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": uploadContentType },
    body: uploadBody
  });
  if (!uploadRes.ok) {
    return upstreamErrorResponse(uploadRes, await uploadRes.text());
  }
  const fileId = (await uploadRes.json()).id;
  const createRes = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: modelId,
      file_id: fileId,
      enable_language_identification: true
    })
  });
  if (!createRes.ok) {
    return upstreamErrorResponse(createRes, await createRes.text());
  }
  const { id: transcriptionId } = await createRes.json();
  const statusUrl = `${providerConfig.baseUrl}/${transcriptionId}`;
  const maxWait = 12e4;
  const start = Date.now();
  let completed = false;
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2e3));
    const pollRes = await fetch(statusUrl, { headers: authHeaders });
    if (!pollRes.ok) {
      continue;
    }
    const result = await pollRes.json();
    if (result.status === "completed") {
      completed = true;
      break;
    }
    if (result.status === "error") {
      return errorResponse(
        500,
        result.error_message || result.error || "Soniox transcription failed"
      );
    }
  }
  if (!completed) {
    return errorResponse(504, "Soniox transcription timed out after 120s");
  }
  const transcriptRes = await fetch(`${statusUrl}/transcript`, { headers: authHeaders });
  if (!transcriptRes.ok) {
    return upstreamErrorResponse(transcriptRes, await transcriptRes.text());
  }
  const transcript = await transcriptRes.json();
  const text = typeof transcript.text === "string" && transcript.text.length > 0 ? transcript.text : Array.isArray(transcript.tokens) ? transcript.tokens.map((t) => t.text ?? "").join("") : "";
  return Response.json({ text }, { headers: { ...CORS_HEADERS } });
}
async function handleNvidiaTranscription(providerConfig, file, modelId, token) {
  const { body, contentType } = await buildMultipartBody(file, { model: modelId });
  const res = await fetch(providerConfig.baseUrl, {
    method: "POST",
    headers: { ...buildAuthHeaders(providerConfig, token), "Content-Type": contentType },
    body
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const data = await res.json();
  const text = data.text || data.transcript || "";
  return Response.json({ text }, { headers: { ...CORS_HEADERS } });
}
async function handleHuggingFaceTranscription(providerConfig, file, modelId, token) {
  if (!isValidPathSegment(modelId)) {
    return errorResponse(400, "Invalid model ID");
  }
  const url = `${providerConfig.baseUrl}/${modelId}`;
  const arrayBuffer = await file.arrayBuffer();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...buildAuthHeaders(providerConfig, token),
      "Content-Type": resolveAudioContentType(file)
    },
    body: arrayBuffer
  });
  if (!res.ok) {
    return upstreamErrorResponse(res, await res.text());
  }
  const data = await res.json();
  const text = data.text || "";
  return Response.json({ text }, { headers: { ...CORS_HEADERS } });
}
function normalizeKieTranscriptionText(recordData) {
  const record = isJsonObject(recordData) ? recordData : {};
  const data = isJsonObject(record.data) ? record.data : {};
  const response = isJsonObject(data.response) ? data.response : {};
  for (const value of [response.text, data.resultText, data.text, record.text]) {
    if (typeof value === "string") return value;
  }
  return "";
}
async function handleKieAudioTranscription(providerConfig, file, modelId, token) {
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const fileBuffer = await file.arrayBuffer();
  const fileBase64 = Buffer.from(fileBuffer).toString("base64");
  let data;
  try {
    data = await kieExecutor.createTask({
      baseUrl,
      token,
      payload: {
        model: modelId,
        input: {
          file_name: getUploadedFileName(file),
          file_base64: fileBase64
        }
      }
    });
  } catch (err) {
    const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) || 502 : 502;
    return Response.json(
      {
        error: {
          message: err instanceof Error ? err.message : "Kie transcription createTask failed",
          code: status
        }
      },
      {
        status,
        headers: { ...CORS_HEADERS }
      }
    );
  }
  const taskId = data?.data?.taskId || data?.taskId;
  if (taskId) {
    return pollKieTranscriptionResult(baseUrl, modelId, taskId, token);
  }
  return Response.json(
    { text: data?.data?.text || data?.text || "" },
    { headers: { ...CORS_HEADERS } }
  );
}
async function pollKieTranscriptionResult(baseUrl, modelId, taskId, token) {
  void modelId;
  const statusUrl = kieExecutor.getTaskStatusUrl(baseUrl);
  try {
    const { data, state } = await kieExecutor.pollTask({
      statusUrl,
      taskId: String(taskId),
      token,
      timeoutMs: 12e4,
      pollIntervalMs: 2e3
    });
    if (state === "success") {
      const text = normalizeKieTranscriptionText(data);
      return Response.json({ text }, { headers: { ...CORS_HEADERS } });
    }
  } catch (err) {
    const status = typeof err === "object" && err !== null && "status" in err ? Number(err.status) || 504 : 504;
    return errorResponse(
      status,
      err instanceof Error ? err.message : "Kie transcription generation timed out or failed"
    );
  }
  return errorResponse(504, "Kie transcription generation timed out or failed");
}
async function handleRevAiTranscription(providerConfig, file, modelId, token) {
  const authHeaders = buildAuthHeaders(providerConfig, token);
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const options = JSON.stringify({ transcriber: modelId });
  const { body, contentType } = await buildMultipartBody(file, { options }, "media");
  const submitRes = await fetch(`${baseUrl}/jobs`, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": contentType },
    body
  });
  if (!submitRes.ok) {
    return upstreamErrorResponse(submitRes, await submitRes.text());
  }
  const { id: jobId } = await submitRes.json();
  const jobUrl = `${baseUrl}/jobs/${jobId}`;
  const maxWait = 12e4;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2e3));
    const pollRes = await fetch(jobUrl, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const result = await pollRes.json();
    if (result.status === "transcribed") {
      const transcriptRes = await fetch(`${jobUrl}/transcript`, {
        headers: { ...authHeaders, Accept: "text/plain" }
      });
      if (!transcriptRes.ok) {
        return upstreamErrorResponse(transcriptRes, await transcriptRes.text());
      }
      const text = await transcriptRes.text();
      return Response.json({ text: text || "" }, { headers: { ...CORS_HEADERS } });
    }
    if (result.status === "failed") {
      return errorResponse(500, result.failure_detail || "Rev AI transcription failed");
    }
  }
  return errorResponse(504, "Rev AI transcription timed out after 120s");
}
function speechmaticsOperatingPoint(modelId) {
  return modelId;
}
async function fetchSpeechmaticsTranscript(jobUrl, authHeaders) {
  const transcriptRes = await fetch(`${jobUrl}/transcript?format=txt`, {
    headers: { ...authHeaders, Accept: "text/plain" }
  });
  if (!transcriptRes.ok) {
    return upstreamErrorResponse(transcriptRes, await transcriptRes.text());
  }
  const text = await transcriptRes.text();
  return Response.json({ text: text || "" }, { headers: { ...CORS_HEADERS } });
}
function speechmaticsJobErrorMessage(result) {
  const errors = result?.job?.errors;
  const first = Array.isArray(errors) ? errors[0] : null;
  return first?.message || "Speechmatics transcription failed";
}
async function pollSpeechmaticsJob(jobUrl, authHeaders) {
  const maxWait = 12e4;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    await new Promise((r) => setTimeout(r, 2e3));
    const pollRes = await fetch(jobUrl, { headers: authHeaders });
    if (!pollRes.ok) continue;
    const result = await pollRes.json();
    const status = result?.job?.status;
    if (status === "done") {
      return fetchSpeechmaticsTranscript(jobUrl, authHeaders);
    }
    if (status === "rejected") {
      return errorResponse(500, speechmaticsJobErrorMessage(result));
    }
  }
  return errorResponse(504, "Speechmatics transcription timed out after 120s");
}
async function handleSpeechmaticsTranscription(providerConfig, file, modelId, token) {
  const authHeaders = buildAuthHeaders(providerConfig, token);
  const baseUrl = providerConfig.baseUrl.replace(/\/$/, "");
  const config = JSON.stringify({
    type: "transcription",
    transcription_config: { operating_point: speechmaticsOperatingPoint(modelId) }
  });
  const { body, contentType } = await buildMultipartBody(file, { config }, "data_file");
  const submitRes = await fetch(baseUrl, {
    method: "POST",
    headers: { ...authHeaders, "Content-Type": contentType },
    body
  });
  if (!submitRes.ok) {
    return upstreamErrorResponse(submitRes, await submitRes.text());
  }
  const { id: jobId } = await submitRes.json();
  if (!jobId) {
    return errorResponse(502, "Speechmatics did not return a job id");
  }
  return pollSpeechmaticsJob(`${baseUrl}/${jobId}`, authHeaders);
}
async function handleAudioTranscription({
  formData,
  credentials,
  resolvedProvider = null,
  resolvedModel = null
}) {
  const model = formData.get("model");
  if (typeof model !== "string" || !model) {
    return errorResponse(400, "model is required");
  }
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof Blob)) {
    return errorResponse(400, "file is required");
  }
  const file = fileEntry;
  let providerConfig = resolvedProvider;
  let modelId = resolvedModel;
  if (!providerConfig) {
    const parsed = parseTranscriptionModel(model);
    providerConfig = parsed.provider ? getTranscriptionProvider(parsed.provider) : null;
    modelId = parsed.model;
  }
  if (!providerConfig) {
    return errorResponse(
      400,
      `No transcription provider found for model "${model}". Available: openai, openrouter, groq, deepgram, assemblyai, nvidia, huggingface, qwen, gladia, rev-ai, speechmatics`
    );
  }
  const token = providerConfig.authType === "none" ? null : credentials?.apiKey || credentials?.accessToken;
  if (providerConfig.authType !== "none" && !token) {
    return errorResponse(401, `No credentials for transcription provider: ${providerConfig.id}`);
  }
  if (providerConfig.format === "vertex-gemini") {
    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      const uploadedType = typeof file.type === "string" && file.type ? file.type : "audio/wav";
      const languageValue = formData.get("language");
      const promptValue = formData.get("prompt");
      const text = await vertexTranscribe(credentials ?? {}, {
        model: modelId,
        audioBase64: buffer.toString("base64"),
        mimeType: uploadedType,
        prompt: typeof promptValue === "string" ? promptValue : void 0,
        language: typeof languageValue === "string" ? languageValue : void 0
      });
      return Response.json({ text }, { headers: { ...CORS_HEADERS } });
    } catch (err) {
      const error = err;
      return errorResponse(
        typeof error?.status === "number" ? error.status : 500,
        `Vertex transcription failed: ${error?.message || "unknown error"}`
      );
    }
  }
  if (providerConfig.format === "deepgram") {
    return handleDeepgramTranscription(providerConfig, file, modelId, token, formData);
  }
  if (providerConfig.format === "assemblyai") {
    return handleAssemblyAITranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "gladia") {
    return handleGladiaTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "soniox") {
    return handleSonioxTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "nvidia-asr") {
    return handleNvidiaTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "huggingface-asr") {
    return handleHuggingFaceTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "kie-audio") {
    return handleKieAudioTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "rev-ai") {
    return handleRevAiTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "speechmatics") {
    return handleSpeechmaticsTranscription(providerConfig, file, modelId, token);
  }
  if (providerConfig.format === "openrouter-stt") {
    return handleOpenRouterTranscription(providerConfig, file, modelId, token, formData);
  }
  const extraFields = {};
  for (const key of [
    "language",
    "prompt",
    "response_format",
    "temperature",
    "timestamp_granularities[]"
  ]) {
    const val = formData.get(key);
    if (val !== null && val !== void 0) {
      extraFields[key] = String(val);
    }
  }
  const { body: multipartBody, contentType: multipartCT } = await buildMultipartBody(file, {
    model: modelId,
    ...extraFields
  });
  try {
    const res = await fetch(providerConfig.baseUrl, {
      method: "POST",
      headers: { ...buildAuthHeaders(providerConfig, token), "Content-Type": multipartCT },
      body: multipartBody
    });
    if (!res.ok) {
      return upstreamErrorResponse(res, await res.text());
    }
    const data = await res.text();
    const respContentType = res.headers.get("content-type") || "application/json";
    return new Response(data, {
      status: 200,
      headers: { "Content-Type": respContentType }
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    return errorResponse(500, `Transcription request failed: ${error.message}`);
  }
}
export {
  buildMultipartBody,
  handleAudioTranscription,
  upstreamErrorResponse
};
