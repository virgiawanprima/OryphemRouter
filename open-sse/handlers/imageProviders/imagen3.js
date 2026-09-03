// Google Imagen 3 image generation — ported from OmniRoute
// imageGeneration/providers/imagen3.ts (handleImagen3ImageGeneration).
// POST {baseUrl} with {prompt, aspect_ratio, number_of_images}; accepts an
// OpenAI-shaped, `images[]`-shaped, or single-object response.
import { nowSec } from "./_base.js";
import { mapImageSize } from "../../utils/omni/sizeMapper.js";

// No registry entry exists upstream (format dispatched as "imagen3" with a
// caller-supplied baseUrl); default to the Google Imagen API host.
const BASE_URL =
  "https://generativelanguage.googleapis.com/v1beta/models";

const DEFAULT_MODELS = ["imagen-3.0-generate-002", "imagen-4.0"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || credentials?.accessToken;
  const aspectRatio = mapImageSize(body.size);
  const upstreamBody = {
    prompt: body.prompt,
    aspect_ratio: aspectRatio,
    number_of_images: body.n ?? 1,
  };
  log?.info?.("IMAGE", `imagen3/${model} (imagen3) | prompt: "${String(body.prompt ?? "").slice(0, 60)}..." | aspect_ratio: ${aspectRatio}`);
  const response = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(upstreamBody),
  });
  if (!response.ok) {
    const errorText = await response.text();
    log?.error?.("IMAGE", `imagen3 error ${response.status}: ${errorText.slice(0, 200)}`);
    throw new Error(errorText || `Imagen3 error ${response.status}`);
  }
  const data = await response.json();
  const images = [];
  if (Array.isArray(data.images)) {
    images.push(
      ...data.images.map((img) => ({
        b64_json: img.image ?? img.b64_json ?? img.url ?? img,
        revised_prompt: body.prompt,
      }))
    );
  } else if (Array.isArray(data.data)) {
    images.push(...data.data);
  } else if (data.url || data.b64_json || data.image) {
    images.push({ b64_json: data.image || data.b64_json || data.url, url: data.url, revised_prompt: body.prompt });
  }
  return { created: data.created || nowSec(), data: images };
}

export default {
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || creds?.accessToken;
    return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
  },
  buildBody: (_model, body) => ({
    prompt: body.prompt,
    aspect_ratio: mapImageSize(body.size),
    number_of_images: body.n ?? 1,
  }),
  normalize: (responseBody, prompt) => {
    const images = [];
    if (Array.isArray(responseBody.images)) {
      images.push(
        ...responseBody.images.map((img) => ({
          b64_json: img.image ?? img.b64_json ?? img.url ?? img,
          revised_prompt: prompt,
        }))
      );
    } else if (Array.isArray(responseBody.data)) {
      images.push(...responseBody.data);
    } else if (responseBody.url || responseBody.b64_json || responseBody.image) {
      images.push({ b64_json: responseBody.image || responseBody.b64_json || responseBody.url, url: responseBody.url, revised_prompt: prompt });
    }
    return { created: responseBody.created || nowSec(), data: images };
  },
};
