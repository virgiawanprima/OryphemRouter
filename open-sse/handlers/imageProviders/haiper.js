// Haiper image generation — ported from OmniRoute
// imageGeneration/providers/haiper.ts (handleHaiperImageGeneration).
// Async submit → poll statusUrl/{job_id} → download creation_url → b64_json.
import { sleep, nowSec, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["haiper"]?.imageConfig?.baseUrl || "https://api.haiper.ai/v1/jobs/gen2/text2image";
const STATUS_URL = PROVIDER_MEDIA["haiper"]?.imageConfig?.statusUrl || "https://api.haiper.ai/v1/jobs";

const DEFAULT_MODELS = ["gen2"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || "";
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  log?.info?.("IMAGE", `haiper/${model} (haiper) | prompt: "${prompt.slice(0, 60)}..."`);
  const res = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", HAIPER_KEY: token },
    body: JSON.stringify({ prompt, aspect_ratio: body.aspect_ratio || "16:9" }),
  });
  if (!res.ok) throw new Error(await res.text());
  const { job_id } = await res.json();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetchImpl(`${STATUS_URL}/${job_id}`, { headers: { HAIPER_KEY: token } });
    const status = await statusRes.json();
    if (status.status === "completed" || status.status === "succeeded") {
      const imgUrl = status.creation_url || status.output?.image_url;
      if (imgUrl) {
        const imgRes = await fetchImpl(imgUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
        const buf = await imgRes.arrayBuffer();
        return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
      }
    }
    if (status.status === "failed") throw new Error("Haiper image generation failed");
  }
  throw new Error("Haiper image generation timed out");
}

export default {
  async: true,
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || "";
    return { "Content-Type": "application/json", HAIPER_KEY: token };
  },
  buildBody: (_model, body) => ({ prompt: body.prompt, aspect_ratio: body.aspect_ratio || "16:9" }),
  async parseResponse(response, { headers }) {
    const { job_id } = await response.json();
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await fetch(`${STATUS_URL}/${job_id}`, { headers: { HAIPER_KEY: headers.HAIPER_KEY } });
      const status = await statusRes.json();
      if (status.status === "completed" || status.status === "succeeded") {
        const imgUrl = status.creation_url || status.output?.image_url;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
          const buf = await imgRes.arrayBuffer();
          return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
        }
      }
      if (status.status === "failed") throw new Error("Haiper image generation failed");
    }
    throw new Error("Haiper image generation timed out");
  },
  normalize: (responseBody) => responseBody,
};
