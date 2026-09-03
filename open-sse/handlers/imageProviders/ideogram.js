// Ideogram image generation — ported from OmniRoute
// imageGeneration/providers/ideogram.ts (handleIdeogramImageGeneration).
// POST {baseUrl} with Api-Key header; downloads data.data[0].url → b64_json.
import { nowSec, urlToBase64 } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["ideogram"]?.imageConfig?.baseUrl || "https://api.ideogram.ai/generate";

const DEFAULT_MODELS = ["V_3", "V_2A"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || "";
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  log?.info?.("IMAGE", `ideogram/${model} (ideogram) | prompt: "${prompt.slice(0, 60)}..."`);
  const res = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Api-Key": token },
    body: JSON.stringify({ prompt, aspect_ratio: "ASPECT_16_9", model: model || "V_3" }),
  });
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(errorText || `Ideogram error ${res.status}`);
  }
  const data = await res.json();
  if (!data.data || data.data.length === 0) throw new Error("No images returned from Ideogram");
  const imgUrl = data.data[0].url;
  const imgRes = await fetchImpl(imgUrl);
  if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
  const buf = await imgRes.arrayBuffer();
  return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
}

export default {
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || "";
    return { "Content-Type": "application/json", "Api-Key": token };
  },
  buildBody: (model, body) => ({
    prompt: body.prompt,
    aspect_ratio: "ASPECT_16_9",
    model: model || "V_3",
  }),
  async parseResponse(response) {
    const data = await response.json();
    if (!data.data || data.data.length === 0) throw new Error("No images returned from Ideogram");
    const imgUrl = data.data[0].url;
    const b64 = await urlToBase64(imgUrl);
    return { created: nowSec(), data: [{ b64_json: b64 }] };
  },
  normalize: (responseBody) => responseBody,
};
