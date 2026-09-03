import { saveCallLog } from "../../utils/omni/usageDb.js";
import { fetchRemoteImage } from "../../utils/omni/remoteImageFetch.js";
const UPSCALE_CALL_LOG_PATH = "/v1/images/upscale";
const MAX_UPSCALE_SOURCE_BYTES = 20 * 1024 * 1024;
function toBlobBytes(buffer) {
  const out = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(out).set(buffer);
  return out;
}
function extractUpscaleSourceImage(body) {
  if (!body || typeof body !== "object") return null;
  const b = body;
  const providerOptions = b.provider_options && typeof b.provider_options === "object" && !Array.isArray(b.provider_options) ? b.provider_options : {};
  const keys = [
    "image_url",
    "imageUrl",
    "input_image",
    "source_image",
    "promptImage",
    "prompt_image",
    "image",
    "images",
    "image_urls",
    "imageUrls",
    "input_images",
    "reference_images",
    "referenceImages",
    "reference_image"
  ];
  for (const key of keys) {
    const found = firstImageCandidate(b[key]) || firstImageCandidate(providerOptions[key]);
    if (found) return found;
  }
  if (Array.isArray(b.messages)) {
    for (const msg of b.messages) {
      if (!msg || typeof msg !== "object") continue;
      const content = msg.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const p = part;
        if (p.type === "image_url" || p.type === "image") {
          const found = firstImageCandidate(p.image_url ?? p.image ?? p.url);
          if (found) return found;
        }
      }
    }
  }
  return null;
}
function firstImageCandidate(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "null" || trimmed === "undefined") return null;
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstImageCandidate(item);
      if (found) return found;
    }
    return null;
  }
  if (value && typeof value === "object") {
    const o = value;
    if (typeof o.url === "string") return firstImageCandidate(o.url);
    if (typeof o.image_url === "string") return firstImageCandidate(o.image_url);
    if (o.image_url && typeof o.image_url === "object") {
      return firstImageCandidate(o.image_url.url);
    }
    if (typeof o.b64_json === "string") return `data:image/png;base64,${o.b64_json}`;
    if (typeof o.base64 === "string") return `data:image/png;base64,${o.base64}`;
  }
  return null;
}
async function resolveUpscaleImageSource(source) {
  const trimmed = String(source || "").trim();
  if (!trimmed) throw new Error("Invalid image source");
  const dataUri = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]+)$/i.exec(trimmed);
  if (dataUri) {
    const contentType = (dataUri[1] || "image/png").trim().toLowerCase();
    const base64 = (dataUri[2] || "").replace(/\s/g, "");
    const buffer2 = Buffer.from(base64, "base64");
    assertSourceBytes(buffer2);
    return {
      buffer: buffer2,
      base64,
      contentType: contentType.startsWith("image/") ? contentType : "image/png"
    };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    const remote = await fetchRemoteImage(trimmed);
    assertSourceBytes(remote.buffer);
    const declared = (remote.contentType || "").split(";")[0].trim().toLowerCase();
    return {
      buffer: remote.buffer,
      base64: remote.buffer.toString("base64"),
      contentType: declared.startsWith("image/") ? declared : sniffImageMime(remote.buffer)
    };
  }
  const buffer = Buffer.from(trimmed.replace(/\s/g, ""), "base64");
  assertSourceBytes(buffer);
  return { buffer, base64: buffer.toString("base64"), contentType: sniffImageMime(buffer) };
}
function assertSourceBytes(buffer) {
  if (!buffer.length) throw new Error("Source image decoded to empty bytes");
  if (buffer.length > MAX_UPSCALE_SOURCE_BYTES) {
    throw new Error(
      `Source image too large (${buffer.length} bytes; max ${MAX_UPSCALE_SOURCE_BYTES})`
    );
  }
}
function sniffImageMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return "image/jpeg";
  }
  if (buffer.length >= 8 && buffer[0] === 137 && buffer.toString("ascii", 1, 4) === "PNG") {
    return "image/png";
  }
  if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF") return "image/gif";
  if (buffer.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 2 && buffer.toString("ascii", 0, 2) === "BM") return "image/bmp";
  return "image/png";
}
function readImageDimensions(buffer) {
  try {
    if (buffer.length >= 24 && buffer[0] === 137 && buffer.toString("ascii", 1, 4) === "PNG") {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    if (buffer.length >= 6 && buffer.toString("ascii", 0, 3) === "GIF") {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    if (buffer.length >= 26 && buffer.toString("ascii", 0, 2) === "BM") {
      return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
    }
    if (buffer.length >= 30 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
      return readWebpDimensions(buffer);
    }
    if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216) {
      return readJpegDimensions(buffer);
    }
  } catch {
    return null;
  }
  return null;
}
function readWebpDimensions(buffer) {
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 " && buffer.length >= 30) {
    return {
      width: buffer.readUInt16LE(26) & 16383,
      height: buffer.readUInt16LE(28) & 16383
    };
  }
  if (chunk === "VP8L" && buffer.length >= 25) {
    const bits = buffer.readUInt32LE(21);
    return { width: (bits & 16383) + 1, height: (bits >> 14 & 16383) + 1 };
  }
  if (chunk === "VP8X" && buffer.length >= 30) {
    const width = 1 + (buffer[24] | buffer[25] << 8 | buffer[26] << 16);
    const height = 1 + (buffer[27] | buffer[28] << 8 | buffer[29] << 16);
    return { width, height };
  }
  return null;
}
function readJpegDimensions(buffer) {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 255) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    if (marker === 216 || marker === 1 || marker >= 208 && marker <= 215) {
      offset += 2;
      continue;
    }
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 192 && marker <= 207 && marker !== 196 && marker !== 200 && marker !== 204;
    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    if (length <= 0) return null;
    offset += 2 + length;
  }
  return null;
}
function scaleDimensions(buffer, factor, maxEdge = 32e3) {
  const source = readImageDimensions(buffer);
  if (!source || source.width <= 0 || source.height <= 0) return null;
  const safeFactor = Number.isFinite(factor) && factor > 0 ? factor : 2;
  const scale = Math.min(
    safeFactor,
    maxEdge / Math.max(source.width, source.height)
  );
  return {
    width: Math.max(1, Math.round(source.width * Math.max(1, scale))),
    height: Math.max(1, Math.round(source.height * Math.max(1, scale)))
  };
}
function saveUpscaleSuccessResult(opts) {
  saveCallLog({
    method: "POST",
    path: UPSCALE_CALL_LOG_PATH,
    status: 200,
    model: `${opts.provider}/${opts.model}`,
    provider: opts.provider,
    duration: Date.now() - opts.startTime,
    requestBody: opts.requestBody ?? null,
    responseBody: opts.responseBody ?? { images_count: opts.images.length }
  }).catch(() => {
  });
  return {
    success: true,
    data: {
      created: Math.floor(Date.now() / 1e3),
      data: opts.images,
      ...opts.meta ? { upscale: opts.meta } : {}
    }
  };
}
function saveUpscaleErrorResult(opts) {
  saveCallLog({
    method: "POST",
    path: UPSCALE_CALL_LOG_PATH,
    status: opts.status,
    model: `${opts.provider}/${opts.model}`,
    provider: opts.provider,
    duration: Date.now() - opts.startTime,
    error: typeof opts.error === "string" ? opts.error.slice(0, 500) : String(opts.error).slice(0, 500),
    requestBody: opts.requestBody ?? null
  }).catch(() => {
  });
  return { success: false, status: opts.status, error: opts.error };
}
function buildUpscaleImageEntry(opts) {
  const wantsBase64 = String(opts.responseFormat ?? "").toLowerCase() === "b64_json";
  if (opts.buffer && opts.buffer.length > 0) {
    const base64 = opts.buffer.toString("base64");
    const mime = opts.contentType || sniffImageMime(opts.buffer);
    return wantsBase64 ? { b64_json: base64 } : { url: `data:${mime};base64,${base64}` };
  }
  return { url: String(opts.url || "") };
}
export {
  MAX_UPSCALE_SOURCE_BYTES,
  UPSCALE_CALL_LOG_PATH,
  buildUpscaleImageEntry,
  extractUpscaleSourceImage,
  readImageDimensions,
  resolveUpscaleImageSource,
  saveUpscaleErrorResult,
  saveUpscaleSuccessResult,
  scaleDimensions,
  sniffImageMime,
  toBlobBytes
};
