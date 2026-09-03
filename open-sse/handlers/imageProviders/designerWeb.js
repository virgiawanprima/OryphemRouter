// Microsoft Designer (unofficial web API) image generation — ported from
// OmniRoute imageGeneration/providers/designerWeb.ts. Submit-then-poll
// against DallE.ashx with Bearer access_token; returns image URLs.
import { randomUUID, randomBytes } from "node:crypto";
import { nowSec } from "./_base.js";
import { resolvePublicCred } from "../../utils/omni/publicCreds.js";
import { sanitizeErrorMessage } from "../../utils/errorSanitize.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL =
  PROVIDER_MEDIA["microsoft-designer-web"]?.imageConfig?.baseUrl ||
  "https://designerapp.officeapps.live.com/designerapp/DallE.ashx?action=GetDallEImagesCogSci";

const DEFAULT_MODELS = ["dall-e-3"];
const POLL_TIMEOUT_MS_DEFAULT = 60000;
const POLL_INTERVAL_MS_DEFAULT = 2000;
const BATCH_SIZE = "4";

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function mapDesignerWebImageSize(size) {
  if (typeof size !== "string" || !size.includes("x")) return "1_1";
  const [wRaw, hRaw] = size.split("x");
  const w = Number(wRaw);
  const h = Number(hRaw);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return "1_1";
  if (w > h * 1.2) return "16_9";
  if (h > w * 1.2) return "9_16";
  return "1_1";
}

function buildDesignerWebHeaders({ accessToken, sessionId = randomUUID(), userId = randomBytes(16).toString("hex") }) {
  return {
    Authorization: `Bearer ${accessToken}`,
    ClientId: resolvePublicCred("microsoft_designer_client_id"),
    SessionId: sessionId,
    UserId: userId,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

function buildDesignerWebFormBody(prompt, size) {
  const params = new URLSearchParams();
  params.set("dalle-caption", prompt);
  params.set("dalle-image-size", mapDesignerWebImageSize(size));
  params.set("dalle-batch-size", BATCH_SIZE);
  params.set("dalle-seed", String(Math.floor(Math.random() * 1_000_000_000)));
  return params;
}

function parseDesignerWebResponse(json) {
  const body = json ?? {};
  const thumbs = Array.isArray(body.image_urls_thumbnail) ? body.image_urls_thumbnail : [];
  const imageUrls = thumbs
    .map((t) => (t && typeof t === "object" ? t.ImageUrl : null))
    .filter((u) => typeof u === "string" && u.length > 0);
  if (imageUrls.length > 0) return { status: "ready", imageUrls, pollIntervalMs: null };
  const pollingMeta = body.polling_response?.polling_meta_data;
  const pollIntervalMs = Number.isFinite(pollingMeta?.poll_interval) ? Number(pollingMeta?.poll_interval) : null;
  if (pollIntervalMs !== null) return { status: "pending", imageUrls: [], pollIntervalMs };
  return { status: "empty", imageUrls: [], pollIntervalMs: null };
}

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt) throw new Error("Prompt is required for Microsoft Designer image generation");
  const accessToken = credentials?.apiKey || credentials?.accessToken;
  if (!accessToken) throw new Error("Microsoft Designer credentials missing access_token");

  const timeoutMs = normalizePositiveNumber(
    body.timeout_ms,
    normalizePositiveNumber(process.env.DESIGNER_WEB_POLL_TIMEOUT_MS, POLL_TIMEOUT_MS_DEFAULT)
  );
  const pollIntervalMs = normalizePositiveNumber(
    body.poll_interval_ms,
    normalizePositiveNumber(process.env.DESIGNER_WEB_POLL_INTERVAL_MS, POLL_INTERVAL_MS_DEFAULT)
  );
  const headers = buildDesignerWebHeaders({ accessToken });
  const formBody = buildDesignerWebFormBody(prompt, body.size);
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt += 1;
    const resp = await fetchImpl(BASE_URL, { method: "POST", headers, body: formBody });
    if (!resp.ok) throw new Error(sanitizeErrorMessage(await resp.text()));
    const parsed = parseDesignerWebResponse(await resp.json());
    if (parsed.status === "ready") {
      return { created: nowSec(), data: parsed.imageUrls.map((url) => ({ url })) };
    }
    if (parsed.status === "empty") {
      throw new Error("Microsoft Designer response did not contain image data or polling metadata");
    }
    const waitMs = Math.min(parsed.pollIntervalMs ?? pollIntervalMs, pollIntervalMs);
    log?.info?.("IMAGE", `designer-web pending, poll #${attempt} in ${waitMs}ms`);
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
  throw new Error("Microsoft Designer image generation timed out waiting for a result");
}

export default {
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const accessToken = creds?.apiKey || creds?.accessToken;
    return buildDesignerWebHeaders({ accessToken });
  },
  buildBody: (_model, body) => buildDesignerWebFormBody(body.prompt, body.size),
  async parseResponse(response, { body, headers }) {
    if (!response.ok) throw new Error(sanitizeErrorMessage(await response.text()));
    const parsed = parseDesignerWebResponse(await response.json());
    if (parsed.status === "ready") return { created: nowSec(), data: parsed.imageUrls.map((url) => ({ url })) };
    if (parsed.status === "empty") {
      throw new Error("Microsoft Designer response did not contain image data or polling metadata");
    }
    // pending — continue polling with the same submit body/headers
    const timeoutMs = normalizePositiveNumber(
      body.timeout_ms,
      normalizePositiveNumber(process.env.DESIGNER_WEB_POLL_TIMEOUT_MS, POLL_TIMEOUT_MS_DEFAULT)
    );
    const pollIntervalMs = normalizePositiveNumber(
      body.poll_interval_ms,
      normalizePositiveNumber(process.env.DESIGNER_WEB_POLL_INTERVAL_MS, POLL_INTERVAL_MS_DEFAULT)
    );
    const deadline = Date.now() + timeoutMs;
    let attempt = 1;
    while (Date.now() < deadline) {
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, Math.min(parsed.pollIntervalMs ?? pollIntervalMs, pollIntervalMs)));
      const resp = await fetch(BASE_URL, { method: "POST", headers, body: buildDesignerWebFormBody(body.prompt, body.size) });
      if (!resp.ok) throw new Error(sanitizeErrorMessage(await resp.text()));
      const p = parseDesignerWebResponse(await resp.json());
      if (p.status === "ready") return { created: nowSec(), data: p.imageUrls.map((url) => ({ url })) };
      if (p.status === "empty") throw new Error("Microsoft Designer response did not contain image data or polling metadata");
    }
    throw new Error("Microsoft Designer image generation timed out waiting for a result");
  },
  normalize: (responseBody) => responseBody,
};
