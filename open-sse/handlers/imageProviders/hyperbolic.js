// Hyperbolic image generation — ported from OmniRoute
// imageGeneration/providers/hyperbolic.ts (handleHyperbolicImageGeneration).
// POST {baseUrl} with {model_name, prompt, height, width, backend}; response
// is { images: [{ image: "<base64>" }] } → normalized to OpenAI shape.
import { nowSec } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL =
  PROVIDER_MEDIA["hyperbolic"]?.imageConfig?.baseUrl ||
  "https://api.hyperbolic.xyz/v1/image/generation";

const DEFAULT_MODELS = ["SDXL1.0-base"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || credentials?.accessToken;
  const [width, height] = (body.size || "1024x1024").split("x").map(Number);
  const upstreamBody = {
    model_name: model,
    prompt: body.prompt,
    height: height || 1024,
    width: width || 1024,
    backend: "auto",
  };
  log?.info?.("IMAGE", `hyperbolic/${model} (hyperbolic) | prompt: "${String(body.prompt ?? "").slice(0, 60)}..."`);
  const response = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(upstreamBody),
  });
  if (!response.ok) {
    const errorText = await response.text();
    log?.error?.("IMAGE", `hyperbolic error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(errorText || `Hyperbolic error ${response.status}`);
  }
  const data = await response.json();
  const images = (data.images || []).map((img) => ({
    b64_json: img.image,
    revised_prompt: body.prompt,
  }));
  return { created: nowSec(), data: images };
}

export default {
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || creds?.accessToken;
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  },
  buildBody: (model, body) => {
    const [width, height] = (body.size || "1024x1024").split("x").map(Number);
    return {
      model_name: model,
      prompt: body.prompt,
      height: height || 1024,
      width: width || 1024,
      backend: "auto",
    };
  },
  normalize: (responseBody, prompt) => {
    const images = (responseBody.images || []).map((img) => ({
      b64_json: img.image,
      revised_prompt: prompt,
    }));
    return { created: nowSec(), data: images };
  },
};
