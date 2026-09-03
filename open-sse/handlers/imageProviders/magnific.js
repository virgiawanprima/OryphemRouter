// Magnific Mystic image generation — ported from OmniRoute
// imageGeneration/providers/magnific.ts (handleMagnificImageGeneration).
// Async submit → poll {statusUrl}/{task_id} → download generated url.
import { sleep, nowSec, POLL_INTERVAL_MS, POLL_TIMEOUT_MS } from "./_base.js";
import { PROVIDER_MEDIA } from "../../providers/index.js";

const BASE_URL = PROVIDER_MEDIA["magnific"]?.imageConfig?.baseUrl || "https://api.magnific.com/v1/ai/mystic";
const STATUS_URL = PROVIDER_MEDIA["magnific"]?.imageConfig?.statusUrl || BASE_URL;

const DEFAULT_MODELS = ["realism", "fluid", "zen", "flexible", "super_real", "editorial_portraits"];

export function supportsModel(model) {
  return DEFAULT_MODELS.includes(model) || typeof model === "string";
}

export function getModels() {
  return DEFAULT_MODELS;
}

function magnificAuthHeader(token) {
  return { "x-magnific-api-key": token };
}

export async function generateImage({ model, body, credentials, log, fetchImpl = fetch }) {
  const token = credentials?.apiKey || "";
  const prompt = typeof body.prompt === "string" ? body.prompt : String(body.prompt ?? "");
  log?.info?.("IMAGE", `magnific/${model} (magnific-mystic) | prompt: "${prompt.slice(0, 60)}..."`);
  const submit = await fetchImpl(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...magnificAuthHeader(token) },
    body: JSON.stringify({
      prompt,
      model: model || "realism",
      resolution: typeof body.resolution === "string" ? body.resolution : "1k",
      aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : "square_1_1",
    }),
  });
  if (!submit.ok) throw new Error(await submit.text());
  const submitJson = await submit.json();
  const taskId = submitJson?.data?.task_id || submitJson?.task_id;
  if (!taskId) throw new Error("Magnific Mystic did not return a task_id");
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const res = await fetchImpl(`${STATUS_URL}/${taskId}`, { headers: { ...magnificAuthHeader(token) } });
    const json = await res.json();
    const task = json?.data || json;
    const status = typeof task?.status === "string" ? task.status : "IN_PROGRESS";
    if (status === "COMPLETED") {
      const generated = Array.isArray(task?.generated) ? task.generated : [];
      const imageUrl = typeof generated[0] === "string" ? generated[0] : undefined;
      if (!imageUrl) throw new Error("Magnific Mystic completed without a generated image URL");
      const imgRes = await fetchImpl(imageUrl);
      if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
      const buf = await imgRes.arrayBuffer();
      return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
    }
    if (status === "FAILED") throw new Error("Magnific Mystic image generation failed");
  }
  throw new Error("Magnific Mystic image generation timed out");
}

export default {
  async: true,
  buildUrl: () => BASE_URL,
  buildHeaders: (creds) => {
    const token = creds?.apiKey || "";
    return { "Content-Type": "application/json", ...magnificAuthHeader(token) };
  },
  buildBody: (model, body) => ({
    prompt: body.prompt,
    model: model || "realism",
    resolution: typeof body.resolution === "string" ? body.resolution : "1k",
    aspect_ratio: typeof body.aspect_ratio === "string" ? body.aspect_ratio : "square_1_1",
  }),
  async parseResponse(response, { headers }) {
    const submitJson = await response.json();
    const taskId = submitJson?.data?.task_id || submitJson?.task_id;
    if (!taskId) throw new Error("Magnific Mystic did not return a task_id");
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const token = headers["x-magnific-api-key"];
    while (Date.now() < deadline) {
      await sleep(POLL_INTERVAL_MS);
      const res = await fetch(`${STATUS_URL}/${taskId}`, { headers: { ...magnificAuthHeader(token) } });
      const json = await res.json();
      const task = json?.data || json;
      const status = typeof task?.status === "string" ? task.status : "IN_PROGRESS";
      if (status === "COMPLETED") {
        const generated = Array.isArray(task?.generated) ? task.generated : [];
        const imageUrl = typeof generated[0] === "string" ? generated[0] : undefined;
        if (!imageUrl) throw new Error("Magnific Mystic completed without a generated image URL");
        const imgRes = await fetch(imageUrl);
        if (!imgRes.ok) throw new Error(`Failed to download image: ${imgRes.status}`);
        const buf = await imgRes.arrayBuffer();
        return { created: nowSec(), data: [{ b64_json: Buffer.from(buf).toString("base64") }] };
      }
      if (status === "FAILED") throw new Error("Magnific Mystic image generation failed");
    }
    throw new Error("Magnific Mystic image generation timed out");
  },
  normalize: (responseBody) => responseBody,
};
