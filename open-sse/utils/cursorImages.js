import crypto from "node:crypto";
import dns from "node:dns";
import { isIP } from "node:net";
import {
  parseAndValidatePublicUrl,
  isPrivateHost,
  OutboundUrlGuardError
} from "./outboundUrlGuard.js";
let sharpFactoryPromise;
function loadSharp() {
  sharpFactoryPromise ??= import("sharp").then((module) => module.default);
  return sharpFactoryPromise;
}
const MAX_CURSOR_IMAGE_BYTES = 1024 * 1024;
const MAX_CURSOR_IMAGE_DECODE_BYTES = 16 * 1024 * 1024;
const CURSOR_VISION_SOFT_MAX_BYTES = 100 * 1024;
const CURSOR_VISION_SOFT_MAX_BYTES_HIGH = 256 * 1024;
const CURSOR_VISION_MAX_EDGE = 2e3;
const MAX_CURSOR_IMAGE_DECODE_EDGE = 8192;
const MAX_CURSOR_IMAGE_PIXELS = 25e6;
const CURSOR_VISION_JPEG_QUALITIES_DEFAULT = [85, 70, 55, 40];
const CURSOR_VISION_JPEG_QUALITIES_HIGH = [90, 80, 65, 50];
const CURSOR_VISION_SOFT_MIN_EDGE = 256;
const CURSOR_VISION_SOFT_SHRINK = 0.85;
const CURSOR_VISION_PASSTHROUGH_MIME = /* @__PURE__ */ new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp"
]);
const MAX_CURSOR_IMAGES = 12;
const IMAGE_FETCH_TIMEOUT_MS = (() => {
  const parsed = parseInt(process.env.CURSOR_IMAGE_FETCH_TIMEOUT_MS || "15000", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 15e3;
})();
const MAX_IMAGE_REDIRECTS = 3;
class CursorImageError extends Error {
  status;
  constructor(message, status = 400) {
    super(message);
    this.name = "CursorImageError";
    this.status = status;
  }
}
function estimatedBase64DecodedBytes(payload) {
  return Math.floor(payload.length * 3 / 4);
}
function isHighDetail(detail) {
  const normalized = (detail || "").toLowerCase();
  return normalized === "high" || normalized === "original";
}
function softMaxBytesForDetail(detail) {
  return isHighDetail(detail) ? CURSOR_VISION_SOFT_MAX_BYTES_HIGH : CURSOR_VISION_SOFT_MAX_BYTES;
}
function jpegQualitiesForDetail(detail) {
  return isHighDetail(detail) ? CURSOR_VISION_JPEG_QUALITIES_HIGH : CURSOR_VISION_JPEG_QUALITIES_DEFAULT;
}
function decodeDataUrl(url) {
  const comma = url.indexOf(",");
  if (comma < 0) {
    throw new CursorImageError("Image data URL is malformed.");
  }
  const header = url.slice(5, comma);
  const payload = url.slice(comma + 1);
  const isBase64 = /;base64/i.test(header);
  const mimeType = (header.split(";")[0] || "").trim().toLowerCase() || "application/octet-stream";
  if (!mimeType.startsWith("image/")) {
    throw new CursorImageError("Image data URL must have an image/* media type.");
  }
  if (!isBase64) {
    throw new CursorImageError("Image data URL must be base64-encoded.");
  }
  if (payload.length > MAX_CURSOR_IMAGE_DECODE_BYTES * 2) {
    throw new CursorImageError("Image input is too large to process safely.");
  }
  const normalized = payload.replace(/\s/g, "");
  if (normalized.length === 0) {
    throw new CursorImageError("Image data URL contains invalid base64 data.");
  }
  if (normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new CursorImageError("Image data URL contains invalid base64 data.");
  }
  if (estimatedBase64DecodedBytes(normalized) > MAX_CURSOR_IMAGE_DECODE_BYTES) {
    throw new CursorImageError("Image input is too large to process safely.");
  }
  let data;
  try {
    data = Buffer.from(normalized, "base64");
  } catch {
    throw new CursorImageError("Image data URL contains invalid base64 data.");
  }
  if (data.length === 0) {
    throw new CursorImageError("Image data URL contains invalid base64 data.");
  }
  if (data.toString("base64").replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new CursorImageError("Image data URL contains invalid base64 data.");
  }
  if (data.length > MAX_CURSOR_IMAGE_DECODE_BYTES) {
    throw new CursorImageError("Image input is too large to process safely.");
  }
  return { data, mimeType };
}
function validatePublicImageUrl(url) {
  try {
    return parseAndValidatePublicUrl(url);
  } catch (err) {
    if (err instanceof OutboundUrlGuardError) {
      throw new CursorImageError(
        err.code === "OUTBOUND_URL_INVALID" ? "Image URL is invalid or uses an unsupported scheme." : "Image URL points to a blocked address."
      );
    }
    throw new CursorImageError("Image URL is invalid.");
  }
}
function assertResolvedAddressesPublic(addresses) {
  for (const addr of addresses) {
    if (isPrivateHost(addr)) {
      throw new CursorImageError("Image URL points to a blocked address.");
    }
  }
}
async function assertHostnameResolvesPublic(hostname) {
  const bare = hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
  if (isIP(bare)) return;
  let resolved;
  try {
    resolved = await dns.promises.lookup(bare, { all: true });
  } catch {
    throw new CursorImageError("Image URL host could not be resolved.");
  }
  assertResolvedAddressesPublic(resolved.map((r) => r.address));
}
async function fetchImageBytes(url) {
  let currentUrl = url;
  for (let hop = 0; hop <= MAX_IMAGE_REDIRECTS; hop++) {
    const parsed = validatePublicImageUrl(currentUrl);
    await assertHostnameResolvesPublic(parsed.hostname);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), IMAGE_FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(parsed.toString(), {
        method: "GET",
        signal: controller.signal,
        redirect: "manual"
      });
    } catch {
      clearTimeout(timer);
      throw new CursorImageError("Could not fetch the image URL.");
    }
    try {
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new CursorImageError("Image URL redirect is missing a destination.");
        }
        try {
          currentUrl = new URL(location, parsed.toString()).toString();
        } catch {
          throw new CursorImageError("Image URL redirect destination is invalid.");
        }
        continue;
      }
      if (!response.ok) {
        throw new CursorImageError(`Could not fetch the image URL (status ${response.status}).`);
      }
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      const mimeType = contentType.split(";")[0].trim();
      if (!mimeType.startsWith("image/")) {
        throw new CursorImageError("Image URL did not return an image content type.");
      }
      const declaredLen = Number(response.headers.get("content-length") || "0");
      if (Number.isFinite(declaredLen) && declaredLen > MAX_CURSOR_IMAGE_DECODE_BYTES) {
        throw new CursorImageError("Image input is too large to process safely.");
      }
      const data = await readCapped(response, MAX_CURSOR_IMAGE_DECODE_BYTES);
      return { data, mimeType };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new CursorImageError("Image URL has too many redirects.");
}
async function readCapped(response, cap) {
  const body = response.body;
  if (!body) {
    return Buffer.alloc(0);
  }
  const chunks = [];
  let total = 0;
  const pushCapped = (chunk) => {
    total += chunk.byteLength;
    if (total > cap) {
      throw new CursorImageError("Image input is too large to process safely.");
    }
    chunks.push(Buffer.from(chunk));
  };
  if (typeof body[Symbol.asyncIterator] === "function") {
    for await (const chunk of body) {
      pushCapped(chunk);
    }
    return Buffer.concat(chunks, total);
  }
  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    try {
      for (; ; ) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) pushCapped(value);
      }
    } finally {
      try {
        await reader.cancel();
      } catch {
      }
    }
    return Buffer.concat(chunks, total);
  }
  const buf = Buffer.from(await response.arrayBuffer());
  if (buf.length > cap) {
    throw new CursorImageError("Image input is too large to process safely.");
  }
  return buf;
}
function sniffCursorImageFormat(data) {
  if (data.byteLength >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) {
    return "png";
  }
  if (data.byteLength >= 6 && data[0] === 71 && data[1] === 73 && data[2] === 70 && data[3] === 56) {
    return "gif";
  }
  if (data.byteLength >= 4 && data[0] === 255 && data[1] === 216) return "jpeg";
  if (data.byteLength >= 12 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
    return "webp";
  }
  return void 0;
}
function sniffCursorImageDimensions(data) {
  if (data.byteLength >= 24 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71 && data[4] === 13 && data[5] === 10 && data[6] === 26 && data[7] === 10) {
    const width = (data[16] << 24 | data[17] << 16 | data[18] << 8 | data[19]) >>> 0;
    const height = (data[20] << 24 | data[21] << 16 | data[22] << 8 | data[23]) >>> 0;
    if (width > 0 && height > 0) return { width, height };
  }
  if (data.byteLength >= 10 && data[0] === 71 && data[1] === 73 && data[2] === 70 && data[3] === 56) {
    const width = data[6] | data[7] << 8;
    const height = data[8] | data[9] << 8;
    if (width > 0 && height > 0) return { width, height };
  }
  if (data.byteLength >= 30 && data[0] === 82 && data[1] === 73 && data[2] === 70 && data[3] === 70 && data[8] === 87 && data[9] === 69 && data[10] === 66 && data[11] === 80) {
    const fourcc = String.fromCharCode(data[12], data[13], data[14], data[15]);
    if (fourcc === "VP8X") {
      const width = 1 + (data[24] | data[25] << 8 | data[26] << 16);
      const height = 1 + (data[27] | data[28] << 8 | data[29] << 16);
      if (width > 0 && height > 0) return { width, height };
    } else if (fourcc === "VP8 ") {
      if (data[23] === 157 && data[24] === 1 && data[25] === 42) {
        const width = (data[26] | data[27] << 8) & 16383;
        const height = (data[28] | data[29] << 8) & 16383;
        if (width > 0 && height > 0) return { width, height };
      }
    } else if (fourcc === "VP8L" && data[20] === 47) {
      const raw = data[21] | data[22] << 8 | data[23] << 16 | data[24] << 24;
      const width = (raw & 16383) + 1;
      const height = (raw >> 14 & 16383) + 1;
      if (width > 0 && height > 0) return { width, height };
    }
  }
  if (data.byteLength >= 4 && data[0] === 255 && data[1] === 216) {
    let offset = 2;
    while (offset + 8 < data.byteLength) {
      if (data[offset] !== 255) break;
      const marker = data[offset + 1];
      if (marker === 1 || marker >= 208 && marker <= 217) {
        offset += 2;
        continue;
      }
      const length = data[offset + 2] << 8 | data[offset + 3];
      if (marker === 192 || marker === 194) {
        const height = data[offset + 5] << 8 | data[offset + 6];
        const width = data[offset + 7] << 8 | data[offset + 8];
        if (width > 0 && height > 0) return { width, height };
        break;
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return void 0;
}
async function prepareCursorImageForWire(input) {
  const sharp = await loadSharp();
  const mime = input.mimeType.toLowerCase();
  const softMax = softMaxBytesForDetail(input.detail);
  const qualities = jpegQualitiesForDetail(input.detail);
  const lowestQuality = qualities[qualities.length - 1];
  if (!CURSOR_VISION_PASSTHROUGH_MIME.has(mime)) {
    throw new CursorImageError("Image input type is unsupported.");
  }
  const format = sniffCursorImageFormat(input.data);
  const sniffed = sniffCursorImageDimensions(input.data);
  if (sniffed) {
    const edge = Math.max(sniffed.width, sniffed.height);
    const pixels = sniffed.width * sniffed.height;
    if (edge > MAX_CURSOR_IMAGE_DECODE_EDGE || pixels > MAX_CURSOR_IMAGE_PIXELS) {
      throw new CursorImageError("Image input dimensions are too large.");
    }
  }
  const declaredJpeg = mime === "image/jpeg" || mime === "image/jpg";
  const alreadySmallJpeg = declaredJpeg && format === "jpeg" && sniffed !== void 0 && input.data.byteLength <= softMax;
  if (alreadySmallJpeg) {
    return {
      data: input.data,
      mimeType: "image/jpeg",
      width: sniffed.width,
      height: sniffed.height
    };
  }
  try {
    await sharp(input.data, { failOn: "error" }).resize(1, 1).jpeg({ quality: 1 }).toBuffer();
    if (declaredJpeg && format === "jpeg" && input.data.byteLength <= softMax) {
      const dims = sniffed ?? await sharp(input.data).metadata();
      const width2 = typeof dims.width === "number" ? dims.width : void 0;
      const height2 = typeof dims.height === "number" ? dims.height : void 0;
      return {
        data: input.data,
        mimeType: "image/jpeg",
        ...width2 && height2 && width2 > 0 && height2 > 0 ? { width: width2, height: height2 } : {}
      };
    }
    const meta = await sharp(input.data).metadata();
    const width = typeof meta.width === "number" ? meta.width : 0;
    const height = typeof meta.height === "number" ? meta.height : 0;
    if (width > 0 && height > 0) {
      const edge = Math.max(width, height);
      if (edge > MAX_CURSOR_IMAGE_DECODE_EDGE || width * height > MAX_CURSOR_IMAGE_PIXELS) {
        throw new CursorImageError("Image input dimensions are too large.");
      }
    }
    let targetW = width;
    let targetH = height;
    if (width > 0 && height > 0 && Math.max(width, height) > CURSOR_VISION_MAX_EDGE) {
      const scale = CURSOR_VISION_MAX_EDGE / Math.max(width, height);
      targetW = Math.max(1, Math.round(width * scale));
      targetH = Math.max(1, Math.round(height * scale));
    }
    const encodeAt = async (w, h, quality) => {
      let pipeline = sharp(input.data, { failOn: "error" });
      if (w > 0 && h > 0 && (w !== width || h !== height)) {
        pipeline = pipeline.resize(w, h);
      }
      return pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
    };
    let best;
    for (const quality of qualities) {
      const encoded = await encodeAt(targetW, targetH, quality);
      if (!best || encoded.byteLength < best.byteLength) best = encoded;
      if (encoded.byteLength <= softMax) {
        const outDims = sniffCursorImageDimensions(encoded);
        return {
          data: encoded,
          mimeType: "image/jpeg",
          ...outDims ?? (targetW > 0 && targetH > 0 ? { width: targetW, height: targetH } : {})
        };
      }
    }
    while (best && best.byteLength > softMax && targetW > 0 && targetH > 0 && Math.max(targetW, targetH) > CURSOR_VISION_SOFT_MIN_EDGE) {
      const nextW = Math.max(1, Math.round(targetW * CURSOR_VISION_SOFT_SHRINK));
      const nextH = Math.max(1, Math.round(targetH * CURSOR_VISION_SOFT_SHRINK));
      if (Math.max(nextW, nextH) < CURSOR_VISION_SOFT_MIN_EDGE) {
        const scale = CURSOR_VISION_SOFT_MIN_EDGE / Math.max(targetW, targetH);
        targetW = Math.max(1, Math.round(targetW * scale));
        targetH = Math.max(1, Math.round(targetH * scale));
      } else {
        targetW = nextW;
        targetH = nextH;
      }
      const encoded = await encodeAt(targetW, targetH, lowestQuality);
      if (!best || encoded.byteLength < best.byteLength) best = encoded;
      if (encoded.byteLength <= softMax) {
        const outDims = sniffCursorImageDimensions(encoded);
        return {
          data: encoded,
          mimeType: "image/jpeg",
          ...outDims ?? { width: targetW, height: targetH }
        };
      }
      if (Math.max(targetW, targetH) <= CURSOR_VISION_SOFT_MIN_EDGE) break;
    }
    if (best) {
      const outDims = sniffCursorImageDimensions(best);
      return {
        data: best,
        mimeType: "image/jpeg",
        ...outDims ?? (targetW > 0 && targetH > 0 ? { width: targetW, height: targetH } : {})
      };
    }
    if (declaredJpeg && format !== "jpeg") {
      throw new CursorImageError("Image input is not a valid JPEG.");
    }
    throw new CursorImageError("Image input could not be prepared for Cursor vision.");
  } catch (err) {
    if (err instanceof CursorImageError) throw err;
    throw new CursorImageError("Image input is undecodable or unsupported.");
  }
}
async function resolveCursorImages(imageUrls, options) {
  const prepareForWire = options?.prepareForWire !== false;
  if (imageUrls.length > MAX_CURSOR_IMAGES) {
    throw new CursorImageError(`Too many images in one request (max ${MAX_CURSOR_IMAGES}).`);
  }
  const out = [];
  for (const url of imageUrls) {
    if (typeof url !== "string" || !url) {
      throw new CursorImageError("Image URL is missing.");
    }
    const { data, mimeType } = url.toLowerCase().startsWith("data:") ? decodeDataUrl(url) : await fetchImageBytes(url);
    if (!data.length) {
      throw new CursorImageError("Image input is empty.");
    }
    if (data.length > MAX_CURSOR_IMAGE_DECODE_BYTES) {
      throw new CursorImageError("Image input is too large to process safely.");
    }
    if (!prepareForWire) {
      if (data.length > MAX_CURSOR_IMAGE_BYTES) {
        throw new CursorImageError("Image input is too large (max 1 MiB). Resize and retry.");
      }
      out.push({ data, mimeType, uuid: crypto.randomUUID() });
      continue;
    }
    const prepared = await prepareCursorImageForWire({
      data,
      mimeType,
      detail: options?.detail
    });
    if (prepared.data.length > MAX_CURSOR_IMAGE_BYTES) {
      throw new CursorImageError("Image input is too large (max 1 MiB). Resize and retry.");
    }
    out.push({
      data: prepared.data,
      mimeType: prepared.mimeType,
      uuid: crypto.randomUUID(),
      ...typeof prepared.width === "number" && typeof prepared.height === "number" ? { width: prepared.width, height: prepared.height } : {}
    });
  }
  return out;
}
function extractImageUrls(content) {
  if (!Array.isArray(content)) return [];
  const urls = [];
  for (const part of content) {
    if (part && typeof part === "object" && part.type === "image_url") {
      const imageUrl = part.image_url;
      if (typeof imageUrl === "string") {
        urls.push(imageUrl);
      } else if (imageUrl && typeof imageUrl === "object" && typeof imageUrl.url === "string") {
        urls.push(imageUrl.url);
      }
    }
  }
  return urls;
}
export {
  CURSOR_VISION_MAX_EDGE,
  CURSOR_VISION_SOFT_MAX_BYTES,
  CURSOR_VISION_SOFT_MAX_BYTES_HIGH,
  CursorImageError,
  MAX_CURSOR_IMAGES,
  MAX_CURSOR_IMAGE_BYTES,
  MAX_CURSOR_IMAGE_DECODE_BYTES,
  MAX_CURSOR_IMAGE_DECODE_EDGE,
  MAX_CURSOR_IMAGE_PIXELS,
  assertResolvedAddressesPublic,
  extractImageUrls,
  prepareCursorImageForWire,
  resolveCursorImages,
  sniffCursorImageDimensions,
  sniffCursorImageFormat
};
