// Leonardo image generation — ported from OmniRoute
// imageGeneration/providers/leonardo.ts (handleLeonardoImageGeneration).
// Async submit → poll {baseUrl}/{generationId} → download generated url.
import { sleep, nowSec, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["leonardo"]?.imageConfig?.baseUrl || "https://cloud.leonardo.ai/api/rest/v1/generations";

const DEFAULT_MODELS = ["phoenix", "sdxl"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || "";
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  log?.info?.("IMAGE", `leonardo/${model} (leonardo) | prompt: "${prompt.slice(0, 60)}..."`);
  const res = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      modelId: model || "phoenix",
      prompt,
      width: body.width || 1024,
      height: body.height || 1024,
      num_images: 1,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const { sdGenerationJob } = await res.json();
  const genId = sdGenerationJob?.generationId;
  if (!genId) throw new Error("No generation ID returned");
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const statusRes = await fetchImpl(`${BASE_URL}/${genId}`, { headers: { Authorization: `Bearer ${token}` } });
    const status = await statusRes.json();
    const gen = status.generations_by_pk || status;
    if (gen.status === "COMPLETE") {
      const imgUrl = gen.generated_images?.[0]?.url;
      if (imgUrl) {
        const imgRes = await fetchImpl(imgUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
        const buf = await imgRes.arrayBuffer();
        return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
      }
    }
    if (gen.status === "FAILED") throw new Error("Leonardo image generation failed");
  }
  throw new Error("Leonardo image generation timed out");
}

export default {
  async: true,
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || "";
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  },
  buildBody: (model, body) => ({
    modelId: model || "phoenix",
    prompt: body.prompt,
    width: body.width || 1024,
    height: body.height || 1024,
    num_images: 1,
  }),
  async parseResponse(response, { headers }) {
    const { sdGenerationJob } = await response.json();
    const genId = sdGenerationJob?.generationId;
    if (!genId) throw new Error("No generation ID returned");
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const statusRes = await fetch(`${BASE_URL}/${genId}`, { headers: { Authorization: headers.Authorization } });
      const status = await statusRes.json();
      const gen = status.generations_by_pk || status;
      if (gen.status === "COMPLETE") {
        const imgUrl = gen.generated_images?.[0]?.url;
        if (imgUrl) {
          const imgRes = await fetch(imgUrl);
          if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
          const buf = await imgRes.arrayBuffer();
          return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
        }
      }
      if (gen.status === "FAILED") throw new Error("Leonardo image generation failed");
    }
    throw new Error("Leonardo image generation timed out");
  },
  normalize: (responseBody) => responseBody,
};
