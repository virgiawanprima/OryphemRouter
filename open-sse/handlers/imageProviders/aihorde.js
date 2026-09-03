// AI Horde image generation — ported from OmniRoute
// imageGeneration/providers/aihorde.ts (handleAiHordeImageGeneration).
// Async submit → poll check/status → download R2 image bytes.
// Uses the ported catalog service (services/aihordeImageCatalog.js) and
// safeOutboundFetch/fetchRemoteImage (utils/omni/).
import { sleep, nowSec } from "./_base.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { safeOutboundFetch } from "../../utils/omni/safeOutboundFetch.js";
import { fetchRemoteImage } from "../../utils/omni/remoteImageFetch.js";
import {
  AI_HORDE_ANONYMOUS_KEY,
  AI_HORDE_API_BASE,
  AI_HORDE_CATALOG_FETCH_TIMEOUT_MS,
  AI_HORDE_CLIENT_AGENT,
  aiHordeImageCatalog,
} from "../../services/aihordeImageCatalog.js";
import {
  extractHordeSourceB64,
  mapHordeGenerateRequest,
  stripHordeModelPrefix,
} from "./aihordeMapRequest.js";

const GENERATE_TIMEOUT_MS = 600_000;
const POLL_INTERVAL_MS = 1_000;
const HORDE_API_CALL_TIMEOUT_MS = 30_000;
const HORDE_IMAGE_DOWNLOAD_TIMEOUT_MS = 60_000;
const MAX_HORDE_IMAGE_BYTES = 25 * 1024 * 1024;

const DEFAULT_MODELS = ["stable_diffusion"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function hordeHeaders(apiKey) {
  return {
    apikey: apiKey,
    "Client-Agent": AI_HORDE_CLIENT_AGENT,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function boundedTimeoutMs(deadline, cap) {
  return Math.max(1_000, Math.min(cap, deadline - Date.now()));
}

function hordeMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    const message = payload.message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function mapUpstreamStatus(status) {
  if (status === 400 || status === 401 || status === 403 || status === 404 || status === 429 || status === 503) {
    return status;
  }
  return 502;
}

function resolveHordeApiKey(credentials) {
  const raw = credentials?.apiKey;
  return typeof raw === "string" && raw.trim() ? raw.trim() : AI_HORDE_ANONYMOUS_KEY;
}

async function cancelHordeJob(jobId, apiKey) {
  try {
    await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/status/${jobId}`, {
      method: "DELETE",
      headers: hordeHeaders(apiKey),
      guard: "none",
      timeoutMs: HORDE_API_CALL_TIMEOUT_MS,
    });
  } catch {
    // best-effort cancel
  }
}

async function fetchHordeImageBytes(img, options) {
  const value = img.trim();
  if (value.startsWith("http://") || value.startsWith("https://")) {
    const remote = await fetchRemoteImage(value, {
      timeoutMs: options.timeoutMs,
      signal: options.signal ?? undefined,
      maxBytes: MAX_HORDE_IMAGE_BYTES,
    });
    if (remote.buffer.length === 0) throw new Error("Horde R2 download returned an empty image");
    return remote.buffer.toString("base64");
  }
  return value;
}

export async function generateImage({ model, body, credentials, log, signal = null, timeoutMs = GENERATE_TIMEOUT_MS }) {
  const startTime = Date.now();
  const hordeModel = stripHordeModelPrefix(model);
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  const apiKey = resolveHordeApiKey(credentials);
  const deadline = startTime + timeoutMs;

  log?.info?.("IMAGE", `aihorde/${hordeModel} (aihorde) | prompt: "${prompt.slice(0, 60)}..."`);

  await aiHordeImageCatalog.ensureFresh(undefined, {
    signal: signal ?? undefined,
    timeoutMs: boundedTimeoutMs(deadline, AI_HORDE_CATALOG_FETCH_TIMEOUT_MS),
  });
  if (aiHordeImageCatalog.hasSnapshot() && !aiHordeImageCatalog.isServed(hordeModel)) {
    throw new Error(`No Horde workers are currently serving ${hordeModel}`);
  }

  const sourceImage = extractHordeSourceB64(body);
  const payload = mapHordeGenerateRequest(body, { sourceImage });
  const submit = await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/async`, {
    method: "POST",
    headers: hordeHeaders(apiKey),
    body: JSON.stringify(payload),
    signal: signal ?? undefined,
    guard: "none",
    timeoutMs: boundedTimeoutMs(deadline, HORDE_API_CALL_TIMEOUT_MS),
  });
  const submitBody = await safeJson(submit);
  if (submit.status !== 200 && submit.status !== 202) {
    throw new Error(hordeMessage(submitBody, `Horde submit failed (${submit.status})`));
  }
  const jobId = submitBody && typeof submitBody === "object" ? submitBody.id : null;
  if (typeof jobId !== "string" || !jobId) {
    throw new Error("Horde submit did not return a job id");
  }

  let completed = false;
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Horde image generation cancelled");
      if (Date.now() >= deadline) {
        throw Object.assign(new Error("Horde image generation timed out"), { status: 504 });
      }
      await sleep(POLL_INTERVAL_MS);
      const checkRes = await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/check/${jobId}`, {
        headers: hordeHeaders(apiKey),
        signal: signal ?? undefined,
        guard: "none",
        timeoutMs: boundedTimeoutMs(deadline, HORDE_API_CALL_TIMEOUT_MS),
      });
      const check = await safeJson(checkRes);
      if (!checkRes.ok || !check || typeof check !== "object") {
        throw Object.assign(
          new Error(hordeMessage(check, `Horde check failed (${checkRes.status})`)),
          { status: mapUpstreamStatus(checkRes.status) }
        );
      }
      if (check.faulted) throw new Error("Horde marked the job as faulted");
      if (check.is_possible === false) {
        throw Object.assign(new Error("No Horde workers can currently fulfill this request"), { status: 503 });
      }
      if (!check.done) continue;

      const statusRes = await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/status/${jobId}`, {
        headers: hordeHeaders(apiKey),
        signal: signal ?? undefined,
        guard: "none",
        timeoutMs: boundedTimeoutMs(deadline, HORDE_API_CALL_TIMEOUT_MS),
      });
      const status = await safeJson(statusRes);
      if (!statusRes.ok || !status || typeof status !== "object") {
        throw Object.assign(
          new Error(hordeMessage(status, `Horde status failed (${statusRes.status})`)),
          { status: mapUpstreamStatus(statusRes.status) }
        );
      }
      const generations = status.generations;
      if (!Array.isArray(generations) || generations.length === 0) {
        throw new Error("Horde status contained no generations");
      }
      const images = [];
      for (const item of generations) {
        if (!item || typeof item !== "object") continue;
        const img = item.img;
        if (typeof img !== "string" || !img) continue;
        if (Date.now() >= deadline) {
          throw Object.assign(new Error("Horde image generation timed out"), { status: 504 });
        }
        images.push({
          b64_json: await fetchHordeImageBytes(img, {
            signal,
            timeoutMs: boundedTimeoutMs(deadline, HORDE_IMAGE_DOWNLOAD_TIMEOUT_MS),
          }),
          revised_prompt: prompt,
        });
      }
      if (images.length === 0) throw new Error("Horde status contained no image payloads");
      completed = true;
      return { created: nowSec(), data: images };
    }
  } finally {
    if (!completed) await cancelHordeJob(jobId, apiKey);
  }
}

export default {
  async: true,
  buildUrl: () => `${AI_HORDE_API_BASE}/v2/generate/async`,
  buildHeaders: (creds) => hordeHeaders(resolveHordeApiKey(creds)),
  buildBody: (model, body) => {
    const sourceImage = extractHordeSourceB64(body);
    // mapHordeGenerateRequest reads body.model — synthesize it from the adapter model arg
    return mapHordeGenerateRequest({ ...body, model }, { sourceImage });
  },
  // Async: submit → poll check/status → download. Mirrors handleAiHordeImageGeneration.
  async parseResponse(response, { headers }) {
    const submitBody = await safeJson(response);
    if (response.status !== 200 && response.status !== 202) {
      throw new Error(hordeMessage(submitBody, `Horde submit failed (${response.status})`));
    }
    const jobId = submitBody && typeof submitBody === "object" ? submitBody.id : null;
    if (typeof jobId !== "string" || !jobId) throw new Error("Horde submit did not return a job id");
    const apiKey = headers?.apikey || AI_HORDE_ANONYMOUS_KEY;
    const deadline = Date.now() + GENERATE_TIMEOUT_MS;
    let completed = false;
    try {
      while (true) {
        if (Date.now() >= deadline) throw Object.assign(new Error("Horde image generation timed out"), { status: 504 });
        await sleep(POLL_INTERVAL_MS);
        const checkRes = await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/check/${jobId}`, {
          headers: hordeHeaders(apiKey),
          guard: "none",
          timeoutMs: boundedTimeoutMs(deadline, HORDE_API_CALL_TIMEOUT_MS),
        });
        const check = await safeJson(checkRes);
        if (!checkRes.ok || !check || typeof check !== "object") {
          throw Object.assign(new Error(hordeMessage(check, `Horde check failed (${checkRes.status})`)), {
            status: mapUpstreamStatus(checkRes.status),
          });
        }
        if (check.faulted) throw new Error("Horde marked the job as faulted");
        if (check.is_possible === false) {
          throw Object.assign(new Error("No Horde workers can currently fulfill this request"), { status: 503 });
        }
        if (!check.done) continue;
        const statusRes = await safeOutboundFetch(`${AI_HORDE_API_BASE}/v2/generate/status/${jobId}`, {
          headers: hordeHeaders(apiKey),
          guard: "none",
          timeoutMs: boundedTimeoutMs(deadline, HORDE_API_CALL_TIMEOUT_MS),
        });
        const status = await safeJson(statusRes);
        if (!statusRes.ok || !status || typeof status !== "object") {
          throw Object.assign(new Error(hordeMessage(status, `Horde status failed (${statusRes.status})`)), {
            status: mapUpstreamStatus(statusRes.status),
          });
        }
        const generations = status.generations;
        if (!Array.isArray(generations) || generations.length === 0) throw new Error("Horde status contained no generations");
        const images = [];
        for (const item of generations) {
          if (!item || typeof item !== "object") continue;
          const img = item.img;
          if (typeof img !== "string" || !img) continue;
          if (Date.now() >= deadline) throw Object.assign(new Error("Horde image generation timed out"), { status: 504 });
          images.push({
            b64_json: await fetchHordeImageBytes(img, {
              timeoutMs: boundedTimeoutMs(deadline, HORDE_IMAGE_DOWNLOAD_TIMEOUT_MS),
            }),
          });
        }
        if (images.length === 0) throw new Error("Horde status contained no image payloads");
        completed = true;
        return { created: nowSec(), data: images };
      }
    } finally {
      if (!completed) await cancelHordeJob(jobId, apiKey);
    }
  },
  normalize: (responseBody) => responseBody,
};
