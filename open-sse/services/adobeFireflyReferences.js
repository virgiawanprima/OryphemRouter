import { AdobeFireflyError } from "./adobeFireflyClient.js";
function normalizeAdobeReferenceBlobs(modelSpec, references) {
  if (!Array.isArray(references)) return [];
  const maxReferences = modelSpec.referenceMode === "image" ? 3 : 2;
  if (references.length > maxReferences) {
    throw new AdobeFireflyError(
      `Adobe Firefly model accepts at most ${maxReferences} ${modelSpec.referenceMode === "image" ? "asset" : "frame"} image references`,
      400,
      "bad_image"
    );
  }
  return references.map((reference, index) => {
    if (!reference || typeof reference !== "object") {
      throw new AdobeFireflyError("Invalid Adobe Firefly reference image", 400, "bad_image");
    }
    const value = reference;
    const id = typeof value.id === "string" ? value.id.trim() : "";
    if (!id) {
      throw new AdobeFireflyError("Adobe Firefly reference image id is required", 400, "bad_image");
    }
    const expectedUsage = modelSpec.referenceMode === "image" ? "asset" : "frame";
    const usage = typeof value.usage === "string" ? value.usage.trim() : expectedUsage;
    if (usage !== expectedUsage) {
      throw new AdobeFireflyError(
        `Adobe Firefly model does not support image references with usage '${usage}'`,
        400,
        "bad_image"
      );
    }
    return expectedUsage === "frame" ? { id, usage, order: index + 1 } : { id, usage };
  });
}
function extractAdobeSourceImageReferences(body, max = 4) {
  if (!body || typeof body !== "object") return [];
  const inputs = body.adobe_reference_inputs;
  if (!Array.isArray(inputs)) return [];
  const references = [];
  for (const input of inputs) {
    if (!input || typeof input !== "object") continue;
    const value = input;
    if (value.type !== void 0 && value.type !== "input_image" && value.type !== "image" && value.type !== "image_url") {
      continue;
    }
    const imageUrl = value.image_url;
    const source = typeof value.source === "string" ? value.source.trim() : typeof imageUrl === "string" ? imageUrl.trim() : imageUrl && typeof imageUrl === "object" && typeof imageUrl.url === "string" ? String(imageUrl.url).trim() : typeof value.url === "string" ? value.url.trim() : "";
    if (!source || !source.startsWith("data:image/") && !/^https?:\/\//i.test(source)) continue;
    const usage = typeof value.usage === "string" && value.usage.trim() ? value.usage.trim() : void 0;
    const order = typeof value.order === "number" && Number.isInteger(value.order) && value.order > 0 ? value.order : void 0;
    references.push({ source, ...usage ? { usage } : {}, ...order ? { order } : {} });
    if (references.length >= max) break;
  }
  return references;
}
export {
  extractAdobeSourceImageReferences,
  normalizeAdobeReferenceBlobs
};
