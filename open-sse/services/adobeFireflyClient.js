import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolvePublicCred } from "../utils/publicCreds.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
import {
  decodeAdobeJwtPayload,
  findAllAdobeJwts,
  isExactAdobeJwt,
  stripAdobeJwts
} from "./adobeFireflySecurity.js";
import {
  parseAdobeModelsDiscovery as parseAdobeModelsDiscoveryContract
} from "./adobeFireflyModels.js";
import { decodeAdobeJwtPayload as decodeAdobeJwtPayload2 } from "./adobeFireflySecurity.js";
const ADOBE_FIREFLY_IMAGE_SUBMIT_URL = "https://firefly-3p.ff.adobe.io/v2/3p-images/generate-async";
const ADOBE_FIREFLY_VIDEO_SUBMIT_URL = "https://firefly-3p.ff.adobe.io/v2/3p-videos/generate-async";
const ADOBE_FIREFLY_IMAGE_UPLOAD_URL = "https://firefly-3p.ff.adobe.io/v2/storage/image";
const ADOBE_FIREFLY_MODELS_DISCOVERY_URL = "https://firefly-3p.ff.adobe.io/v2/models/discovery";
const ADOBE_FIREFLY_CREDITS_BALANCE_URL = "https://firefly.adobe.io/v1/credits/balance";
const ADOBE_FIREFLY_IMS_REFRESH_URL = "https://adobeid-na1.services.adobe.com/ims/check/v6/token?jslVersion=v2-v0.48.0-1-g1e322cb";
const ADOBE_FIREFLY_IMS_SCOPE = "AdobeID,firefly_api,openid,pps.read,pps.write,additional_info.projectedProductContext,additional_info.ownerOrg,uds_read,uds_write,ab.manage,read_organizations,additional_info.roles,account_cluster.read,creative_production,tk_platform,tk_platform_sync,profile";
const DEFAULT_USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36";
const DEFAULT_SEC_CH_UA = '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"';
const DEFAULT_POLL_INTERVAL_MS = 3e3;
const DEFAULT_IMAGE_TIMEOUT_MS = 18e4;
const DEFAULT_VIDEO_TIMEOUT_MS = 3e5;
const FIREFLY_ORIGIN = "https://firefly.adobe.com";
const FIREFLY_REFERER = "https://firefly.adobe.com/";
const ADOBE_FIREFLY_IMAGE_MODELS = {
  // Gemini 3.0 (Nano Banana Pro) — discovery: gemini-flash / nano-banana-2
  "nano-banana-pro": {
    upstreamModelId: "gemini-flash",
    upstreamModelVersion: "nano-banana-2",
    family: "nano"
  },
  // Gemini 2.5 (Nano Banana) — discovery: gemini-flash / nano-banana
  "nano-banana": {
    upstreamModelId: "gemini-flash",
    upstreamModelVersion: "nano-banana",
    family: "nano"
  },
  // Gemini 3.1 (Nano Banana 2) — discovery: gemini-flash / nano-banana-3
  "nano-banana-2": {
    upstreamModelId: "gemini-flash",
    upstreamModelVersion: "nano-banana-3",
    family: "nano"
  },
  // GPT Image 2 — discovery modelVersion "2" (get_models: modelDisplayName "GPT Image 2")
  "gpt-image": {
    upstreamModelId: "gpt-image",
    upstreamModelVersion: "2",
    family: "gpt-image"
  },
  // Explicit catalog alias so pickers show "gpt-image-2" distinctly
  "gpt-image-2": {
    upstreamModelId: "gpt-image",
    upstreamModelVersion: "2",
    family: "gpt-image"
  },
  "gpt-image-1.5": {
    upstreamModelId: "gpt-image",
    upstreamModelVersion: "1.5",
    family: "gpt-image"
  },
  "flux-2": {
    upstreamModelId: "flux",
    upstreamModelVersion: "2",
    family: "generic"
  },
  "flux-pro": {
    upstreamModelId: "flux",
    upstreamModelVersion: "fluxPro",
    family: "generic"
  },
  "flux-ultra": {
    upstreamModelId: "flux",
    upstreamModelVersion: "fluxUltra",
    family: "generic"
  },
  "seedream-4": {
    upstreamModelId: "seedream",
    upstreamModelVersion: "seedream_v4",
    family: "generic"
  },
  "seedream-5-lite": {
    upstreamModelId: "seedream",
    upstreamModelVersion: "seedream_v5_lite",
    family: "generic"
  },
  "runway-gen4-image": {
    upstreamModelId: "runway-gen4-image",
    upstreamModelVersion: "gen4_image",
    family: "generic"
  }
};
const ADOBE_FIREFLY_VIDEO_MODELS = {
  "sora-2": {
    engine: "sora2",
    upstreamModel: "openai:firefly:colligo:sora2",
    defaultDuration: 8,
    defaultResolution: "720p"
  },
  "sora-2-pro": {
    engine: "sora2-pro",
    upstreamModel: "openai:firefly:colligo:sora2-pro",
    defaultDuration: 8,
    defaultResolution: "720p"
  },
  "veo-3.1": {
    engine: "veo31-standard",
    upstreamModel: "google:firefly:colligo:veo31",
    modelId: "veo",
    modelVersion: "3.1-generate",
    defaultDuration: 6,
    defaultResolution: "720p"
  },
  "veo-3.1-fast": {
    engine: "veo31-fast",
    upstreamModel: "google:firefly:colligo:veo31-fast",
    modelId: "veo",
    modelVersion: "3.1-fast-generate",
    defaultDuration: 6,
    defaultResolution: "720p"
  },
  "veo-3.1-ref": {
    engine: "veo31-standard",
    upstreamModel: "google:firefly:colligo:veo31",
    modelId: "veo",
    modelVersion: "3.1-generate",
    referenceMode: "image",
    defaultDuration: 6,
    defaultResolution: "720p"
  },
  "kling-3": {
    engine: "kling3",
    upstreamModel: "kling:firefly:colligo:kling3",
    modelId: "kling",
    modelVersion: "kling_v3_standard_i2v",
    defaultDuration: 5,
    defaultResolution: "1080p"
  }
};
const NANO_SIZE_MAP = {
  "1K": {
    "1:1": { width: 1024, height: 1024 },
    "16:9": { width: 1360, height: 768 },
    "9:16": { width: 768, height: 1360 },
    "4:3": { width: 1152, height: 864 },
    "3:4": { width: 864, height: 1152 },
    "1:8": { width: 384, height: 3072 },
    "1:4": { width: 512, height: 2048 },
    "4:1": { width: 2048, height: 512 },
    "8:1": { width: 3072, height: 384 }
  },
  "2K": {
    "1:1": { width: 2048, height: 2048 },
    "16:9": { width: 2752, height: 1536 },
    "9:16": { width: 1536, height: 2752 },
    "4:3": { width: 2048, height: 1536 },
    "3:4": { width: 1536, height: 2048 },
    "1:8": { width: 768, height: 6144 },
    "1:4": { width: 1024, height: 4096 },
    "4:1": { width: 4096, height: 1024 },
    "8:1": { width: 6144, height: 768 }
  },
  "4K": {
    "1:1": { width: 4096, height: 4096 },
    "16:9": { width: 5504, height: 3072 },
    "9:16": { width: 3072, height: 5504 },
    "4:3": { width: 4096, height: 3072 },
    "3:4": { width: 3072, height: 4096 },
    "1:8": { width: 1536, height: 12288 },
    "1:4": { width: 2048, height: 8192 },
    "4:1": { width: 8192, height: 2048 },
    "8:1": { width: 12288, height: 1536 }
  }
};
const GPT_SIZE_MAP = {
  "1K": {
    "1:1": { width: 1024, height: 1024 },
    "5:4": { width: 1120, height: 896 },
    "9:16": { width: 720, height: 1280 },
    "21:9": { width: 1456, height: 624 },
    "16:9": { width: 1280, height: 720 },
    "4:3": { width: 1152, height: 864 },
    "3:2": { width: 1248, height: 832 },
    "4:5": { width: 896, height: 1120 },
    "3:4": { width: 864, height: 1152 },
    "2:3": { width: 832, height: 1248 }
  },
  "2K": {
    "1:1": { width: 2048, height: 2048 },
    "5:4": { width: 2240, height: 1792 },
    "9:16": { width: 1440, height: 2560 },
    "21:9": { width: 3024, height: 1296 },
    "16:9": { width: 2560, height: 1440 },
    "4:3": { width: 2304, height: 1728 },
    "3:2": { width: 2496, height: 1664 },
    "4:5": { width: 1792, height: 2240 },
    "3:4": { width: 1728, height: 2304 },
    "2:3": { width: 1664, height: 2496 }
  },
  "4K": {
    "1:1": { width: 2880, height: 2880 },
    "5:4": { width: 3200, height: 2560 },
    "9:16": { width: 2160, height: 3840 },
    "21:9": { width: 3696, height: 1584 },
    "16:9": { width: 3840, height: 2160 },
    "4:3": { width: 3264, height: 2448 },
    "3:2": { width: 3504, height: 2336 },
    "4:5": { width: 2560, height: 3200 },
    "3:4": { width: 2448, height: 3264 },
    "2:3": { width: 2336, height: 3504 }
  }
};
const PIXEL_SIZE_TO_RATIO = {
  "1024x1024": "1:1",
  "1536x1536": "1:1",
  "2048x2048": "1:1",
  "1024x1792": "9:16",
  "1536x2752": "9:16",
  "1792x1024": "16:9",
  "2752x1536": "16:9",
  "2048x1536": "4:3",
  "1536x2048": "3:4",
  "1280x720": "16:9",
  "720x1280": "9:16",
  "1920x1080": "16:9",
  "1080x1920": "9:16"
};
class AdobeFireflyError extends Error {
  status;
  code;
  constructor(message, status = 502, code) {
    super(message);
    this.name = "AdobeFireflyError";
    this.status = status;
    this.code = code;
  }
}
function adobeFireflyApiKey() {
  return resolvePublicCred("adobe_firefly_api_key", "ADOBE_FIREFLY_API_KEY");
}
function adobeFireflyExpressClientId() {
  return resolvePublicCred("adobe_firefly_express_client_id", "ADOBE_FIREFLY_EXPRESS_CLIENT_ID");
}
function adobeFireflyBalanceApiKey() {
  return resolvePublicCred("adobe_firefly_balance_api_key", "ADOBE_FIREFLY_BALANCE_API_KEY");
}
function extractAdobeAccountIdFromToken(token) {
  const payload = decodeAdobeJwtPayload(token);
  if (!payload) return "";
  const candidates = [payload.user_id, payload.aa_id, payload.sub, payload.id];
  for (const c of candidates) {
    if (typeof c === "string" && c.includes("@")) return c.trim();
  }
  for (const c of candidates) {
    if (typeof c === "string" && c.trim()) return c.trim();
  }
  return "";
}
function looksLikeAdobeJwt(value) {
  const raw = value.trim();
  if (!raw) return false;
  if (raw.includes(";") || raw.includes("=") && !raw.startsWith("eyJ")) return false;
  if (/\s/.test(raw) && !/^bearer\s+/i.test(raw)) return false;
  const token = raw.replace(/^bearer\s+/i, "").trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  if (token.length < 80) return false;
  return parts.every((p) => p.length > 0 && /^[A-Za-z0-9_-]+$/.test(p));
}
function isAdobeGuestAccessToken(token) {
  const payload = decodeAdobeJwtPayload(token);
  if (!payload) return false;
  const userId = typeof payload.user_id === "string" ? payload.user_id : "";
  const aaId = typeof payload.aa_id === "string" ? payload.aa_id : "";
  const type = typeof payload.type === "string" ? payload.type.toLowerCase() : "";
  if (userId.includes("@AdobeID") || aaId.includes("@AdobeID")) return false;
  if (userId.includes("@GuestID") || aaId.includes("@GuestID")) return true;
  if (type === "guest" || type.includes("guest")) return true;
  if (!userId && !aaId) return true;
  return false;
}
function isAdobeUserAccessToken(token) {
  return looksLikeAdobeJwt(token) && !isAdobeGuestAccessToken(token);
}
function extractAdobeCredentialToken(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^bearer\s+/i.test(value)) {
    const bare = value.replace(/^bearer\s+/i, "").trim().split(/\s+/)[0] || "";
    if (looksLikeAdobeJwt(bare)) return bare;
  }
  const accessMatch = value.match(/(?:^|[;\s&])access_token=([^;\s&]+)/i);
  if (accessMatch?.[1]) {
    const t = decodeURIComponent(accessMatch[1].trim());
    if (looksLikeAdobeJwt(t)) return t;
  }
  const tokenValueMatch = value.match(/"tokenValue"\s*:\s*"(eyJ[^"]+)"/i);
  if (tokenValueMatch?.[1] && looksLikeAdobeJwt(tokenValueMatch[1])) {
    return tokenValueMatch[1];
  }
  const authMatch = value.match(
    /Authorization\s*:\s*Bearer\s+([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)/i
  );
  if (authMatch?.[1] && looksLikeAdobeJwt(authMatch[1])) return authMatch[1];
  const jwtMatches = findAllAdobeJwts(value);
  if (jwtMatches && jwtMatches.length > 0) {
    const sorted = [...jwtMatches].sort((a, b) => b.length - a.length);
    const user = sorted.find((t) => looksLikeAdobeJwt(t) && isAdobeUserAccessToken(t));
    if (user) return user;
    const best = sorted[0];
    if (looksLikeAdobeJwt(best)) return best;
  }
  if (looksLikeAdobeJwt(value)) return value.replace(/^bearer\s+/i, "").trim();
  return value;
}
function looksLikeAdobeCookieBlob(value) {
  const raw = String(value || "").trim();
  if (!raw || looksLikeAdobeJwt(raw)) return false;
  if (raw.includes(";") && raw.includes("=")) return true;
  if (/(?:^|[;\s])(?:aux_sid|ff_session|sherlockToken|forterToken|arkose)=/i.test(raw)) {
    return true;
  }
  return false;
}
function extractAdobeCookieHeader(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (looksLikeAdobeJwt(value)) return "";
  const cleaned = value.split(/[\r\n]+/).map((line) => line.trim()).filter((line) => {
    if (!line) return false;
    if (/^authorization\s*:/i.test(line)) return false;
    if (/^bearer\s+/i.test(line)) return false;
    if (looksLikeAdobeJwt(line)) return false;
    if (isExactAdobeJwt(line)) return false;
    return true;
  }).join("; ");
  const noJwt = stripAdobeJwts(cleaned).replace(/;\s*;/g, ";").replace(/^;\s*|\s*;$/g, "").trim();
  if (!noJwt || !looksLikeAdobeCookieBlob(noJwt)) return "";
  return noJwt.replace(/[\r\n]+/g, "; ").trim();
}
const GUEST_COOKIE_HELP = "Firefly page cookies alone only mint a GUEST IMS token (no AdobeID) \u2014 generate returns 401 and Limits 403. Fix: open firefly.adobe.com signed-in \u2192 F12 \u2192 Network \u2192 click a request to firefly-3p.ff.adobe.io (generate-async or models/discovery) \u2192 Request Headers \u2192 Authorization \u2192 copy the token AFTER 'Bearer ' (starts with eyJ\u2026). Paste that JWT as the credential. Cookie-only works only if you also export IMS session cookies from adobelogin.com / adobeid-na1 (Cookie-Editor \u2192 export all Adobe domains); firefly.adobe.com cookies by themselves are not enough.";
function normalizeAdobeAspectRatio(sizeOrRatio, fallback = "1:1") {
  if (typeof sizeOrRatio !== "string" || !sizeOrRatio.trim()) return fallback;
  let raw = sizeOrRatio.trim().replace(/_/g, ":");
  if (raw.toLowerCase() === "auto") return fallback;
  if (/^\d+:\d+$/.test(raw)) return raw;
  const short = raw.match(/^(\d+)x(\d+)$/i);
  if (short) {
    const a = Number(short[1]);
    const b = Number(short[2]);
    if (a > 0 && b > 0 && a < 100 && b < 100) return `${a}:${b}`;
  }
  const lower = raw.toLowerCase();
  if (PIXEL_SIZE_TO_RATIO[lower]) return PIXEL_SIZE_TO_RATIO[lower];
  const pixel = lower.match(/^(\d+)x(\d+)$/);
  if (pixel) {
    const w = Number(pixel[1]);
    const h = Number(pixel[2]);
    if (w > 0 && h > 0) {
      if (Math.abs(w - h) / Math.max(w, h) < 0.08) return "1:1";
      if (w > h * 1.5) return "16:9";
      if (h > w * 1.5) return "9:16";
      if (w > h) return "4:3";
      return "3:4";
    }
  }
  return fallback;
}
function normalizeAdobeOutputResolution(quality, size) {
  const q = String(quality ?? "").trim().toLowerCase();
  if (q === "4k" || q === "ultra" || q === "high") return "4K";
  if (q === "2k" || q === "hd" || q === "standard" || q === "medium") return "2K";
  if (q === "1k" || q === "low") return "1K";
  const s = String(size ?? "").toLowerCase();
  if (s.includes("4k") || /4096|5504|3840/.test(s)) return "4K";
  if (s.includes("1k") || /1024x1024|768x1360|1360x768/.test(s)) return "1K";
  return "2K";
}
function resolveAdobeImageModel(model) {
  const raw = String(model || "").trim().toLowerCase().replace(/^adobe-firefly\//, "").replace(/^firefly\//, "");
  if (raw.includes("nano-banana2") || raw.includes("nano-banana-2") || raw.includes("nano-banana-3")) {
    return {
      id: "nano-banana-2",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["nano-banana-2"]
    };
  }
  if (raw.includes("nano-banana-pro")) {
    return {
      id: "nano-banana-pro",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["nano-banana-pro"]
    };
  }
  if (raw.includes("nano-banana")) {
    return {
      id: "nano-banana",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["nano-banana"]
    };
  }
  if (raw.includes("gpt-image-1.5") || raw.includes("gpt-image1.5")) {
    return {
      id: "gpt-image-1.5",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["gpt-image-1.5"]
    };
  }
  if (raw === "gpt-image-2" || raw.includes("gpt-image-2") || raw.includes("gptimage2") || raw === "gpt-image" || raw.includes("gpt-image")) {
    if (raw.includes("1.5")) {
      return {
        id: "gpt-image-1.5",
        spec: ADOBE_FIREFLY_IMAGE_MODELS["gpt-image-1.5"]
      };
    }
    const id = raw.includes("gpt-image-2") || raw.includes("gptimage2") ? "gpt-image-2" : "gpt-image";
    return {
      id,
      spec: ADOBE_FIREFLY_IMAGE_MODELS["gpt-image"]
    };
  }
  if (raw.includes("flux-ultra") || raw.includes("fluxultra")) {
    return { id: "flux-ultra", spec: ADOBE_FIREFLY_IMAGE_MODELS["flux-ultra"] };
  }
  if (raw.includes("flux-pro") || raw.includes("fluxpro")) {
    return { id: "flux-pro", spec: ADOBE_FIREFLY_IMAGE_MODELS["flux-pro"] };
  }
  if (raw.includes("flux")) {
    return { id: "flux-2", spec: ADOBE_FIREFLY_IMAGE_MODELS["flux-2"] };
  }
  if (raw.includes("seedream-5") || raw.includes("seedream_v5")) {
    return {
      id: "seedream-5-lite",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["seedream-5-lite"]
    };
  }
  if (raw.includes("seedream")) {
    return { id: "seedream-4", spec: ADOBE_FIREFLY_IMAGE_MODELS["seedream-4"] };
  }
  if (raw.includes("runway") && raw.includes("image")) {
    return {
      id: "runway-gen4-image",
      spec: ADOBE_FIREFLY_IMAGE_MODELS["runway-gen4-image"]
    };
  }
  if (raw in ADOBE_FIREFLY_IMAGE_MODELS) {
    const id = raw;
    return { id, spec: ADOBE_FIREFLY_IMAGE_MODELS[id] };
  }
  return {
    id: "nano-banana-pro",
    spec: ADOBE_FIREFLY_IMAGE_MODELS["nano-banana-pro"]
  };
}
function resolveAdobeVideoModel(model) {
  const raw = String(model || "").trim().toLowerCase().replace(/^adobe-firefly\//, "").replace(/^firefly\//, "");
  if (raw.includes("sora2-pro") || raw.includes("sora-2-pro") || raw.includes("sora2_pro")) {
    return { id: "sora-2-pro", spec: ADOBE_FIREFLY_VIDEO_MODELS["sora-2-pro"] };
  }
  if (raw.includes("sora2") || raw.includes("sora-2") || raw.includes("sora")) {
    return { id: "sora-2", spec: ADOBE_FIREFLY_VIDEO_MODELS["sora-2"] };
  }
  if (raw.includes("veo31-ref") || raw.includes("veo-3.1-ref") || raw.includes("veo31_ref")) {
    return {
      id: "veo-3.1-ref",
      spec: ADOBE_FIREFLY_VIDEO_MODELS["veo-3.1-ref"]
    };
  }
  if (raw.includes("veo31-fast") || raw.includes("veo-3.1-fast") || raw.includes("veo31_fast")) {
    return {
      id: "veo-3.1-fast",
      spec: ADOBE_FIREFLY_VIDEO_MODELS["veo-3.1-fast"]
    };
  }
  if (raw.includes("veo31") || raw.includes("veo-3.1") || raw.includes("veo")) {
    return { id: "veo-3.1", spec: ADOBE_FIREFLY_VIDEO_MODELS["veo-3.1"] };
  }
  if (raw.includes("kling")) {
    return { id: "kling-3", spec: ADOBE_FIREFLY_VIDEO_MODELS["kling-3"] };
  }
  if (raw in ADOBE_FIREFLY_VIDEO_MODELS) {
    const id = raw;
    return { id, spec: ADOBE_FIREFLY_VIDEO_MODELS[id] };
  }
  return { id: "sora-2", spec: ADOBE_FIREFLY_VIDEO_MODELS["sora-2"] };
}
function gptDetailLevel(quality) {
  const q = String(quality ?? "medium").trim().toLowerCase();
  if (q === "high" || q === "4k" || q === "ultra") return 5;
  if (q === "low" || q === "1k") return 1;
  if (q === "medium" || q === "2k" || q === "standard" || q === "hd" || q === "auto") return 3;
  return 3;
}
function buildAdobeImagePayload(opts) {
  const ratio = opts.aspectRatio === "auto" ? "1:1" : opts.aspectRatio || "1:1";
  const seeds = [typeof opts.seed === "number" ? opts.seed : Math.floor(Date.now() % 999999)];
  const negative = String(opts.negativePrompt || "").trim();
  const genSettings = {};
  if (negative) {
    genSettings.avoidKeywords = negative.replace(/;/g, ",").split(",").map((w) => w.trim()).filter(Boolean);
  }
  if (opts.modelSpec.family === "gpt-image") {
    const payload2 = {
      n: 1,
      seeds,
      output: { storeInputs: true },
      prompt: opts.prompt,
      referenceBlobs: [],
      modelSpecificPayload: { size: "auto" },
      modelId: opts.modelSpec.upstreamModelId,
      modelVersion: opts.modelSpec.upstreamModelVersion,
      generationMetadata: {
        module: "text2image",
        submodule: "ff-image-generate"
      },
      generationSettings: {
        detailLevel: gptDetailLevel(opts.quality),
        ...genSettings
      }
    };
    if (opts.sourceImageIds?.length) {
      payload2.generationMetadata = { module: "image2image", submodule: "ff-image-generate" };
      payload2.referenceBlobs = opts.sourceImageIds.map((id) => ({
        id: String(id),
        usage: "subject"
      }));
      payload2.modelSpecificPayload = {};
    }
    return payload2;
  }
  const sizeMap = NANO_SIZE_MAP[opts.outputResolution] || NANO_SIZE_MAP["2K"];
  const pixel = sizeMap[ratio] || sizeMap["1:1"];
  const payload = {
    modelId: opts.modelSpec.upstreamModelId,
    modelVersion: opts.modelSpec.upstreamModelVersion,
    n: 1,
    prompt: opts.prompt,
    size: pixel,
    seeds,
    groundSearch: false,
    skipCai: false,
    output: { storeInputs: true },
    generationMetadata: {
      module: "text2image",
      submodule: "ff-image-generate"
    },
    modelSpecificPayload: {
      parameters: { addWatermark: false },
      aspectRatio: ratio
    },
    referenceBlobs: []
  };
  if (Object.keys(genSettings).length) payload.generationSettings = genSettings;
  if (opts.sourceImageIds?.length) {
    payload.referenceBlobs = opts.sourceImageIds.map((id) => ({
      id: String(id),
      usage: "general"
    }));
    if (opts.modelSpec.family === "generic") {
      payload.generationMetadata = {
        module: "image2image",
        submodule: "ff-image-generate"
      };
    }
  }
  return payload;
}
function videoSize(aspectRatio, resolution) {
  const res = String(resolution || "720p").toLowerCase();
  const short = res.includes("1080") ? 1080 : res.includes("480") ? 480 : 720;
  const ratio = aspectRatio === "9:16" ? "9:16" : aspectRatio === "1:1" ? "1:1" : "16:9";
  if (ratio === "1:1") return { width: short, height: short };
  if (ratio === "9:16") return { width: Math.round(short * 9 / 16), height: short };
  return { width: Math.round(short * 16 / 9), height: short };
}
function buildAdobeVideoPayload(opts) {
  const seedVal = typeof opts.seed === "number" ? opts.seed : Math.floor(Date.now() % 999999);
  const aspect = opts.aspectRatio === "auto" ? "16:9" : opts.aspectRatio || "16:9";
  const duration = Math.max(
    1,
    Math.min(30, Math.floor(opts.duration || opts.modelSpec.defaultDuration))
  );
  const resolution = opts.resolution || opts.modelSpec.defaultResolution;
  const vidSize = videoSize(aspect, resolution);
  const engine = opts.modelSpec.engine;
  const sourceImageIds = opts.sourceImageIds || [];
  const negative = String(opts.negativePrompt || "");
  if (engine === "veo31-standard" || engine === "veo31-fast") {
    const payload2 = {
      n: 1,
      seeds: [seedVal],
      modelId: "veo",
      modelVersion: opts.modelSpec.modelVersion || (engine === "veo31-fast" ? "3.1-fast-generate" : "3.1-generate"),
      output: { storeInputs: true },
      prompt: opts.prompt,
      size: vidSize,
      generateAudio: opts.generateAudio !== false,
      referenceBlobs: [],
      generationMetadata: { module: "text2video" },
      modelSpecificPayload: {
        parameters: {
          durationSeconds: duration,
          aspectRatio: aspect,
          addWaterMark: false
        }
      }
    };
    if (sourceImageIds.length) {
      const refs = payload2.referenceBlobs;
      if (opts.modelSpec.referenceMode === "image") {
        for (const imageId of sourceImageIds.slice(0, 3)) {
          refs.push({ id: String(imageId), usage: "asset" });
        }
      } else {
        sourceImageIds.slice(0, 2).forEach((imageId, idx) => {
          refs.push({ id: String(imageId), usage: "general", order: idx + 1 });
        });
      }
      payload2.generationMetadata = { module: "image2video" };
    }
    if (negative) payload2.negativePrompt = negative;
    return payload2;
  }
  if (engine === "kling3") {
    const payload2 = {
      n: 1,
      seeds: [seedVal],
      modelId: "kling",
      modelVersion: "kling_v3_standard_i2v",
      output: { storeInputs: true },
      prompt: opts.prompt,
      size: vidSize,
      generationMetadata: {
        module: sourceImageIds.length ? "image2video" : "text2video"
      },
      duration,
      generationSettings: { aspectRatio: aspect },
      referenceBlobs: []
    };
    if (sourceImageIds.length) {
      const refs = payload2.referenceBlobs;
      sourceImageIds.slice(0, 2).forEach((imageId, idx) => {
        refs.push({ id: String(imageId), usage: "frame", order: idx + 1 });
      });
    }
    if (negative) payload2.negativePrompt = negative;
    return payload2;
  }
  const promptJson = JSON.stringify({
    prompt: opts.prompt,
    duration,
    ...negative ? { negative_prompt: negative } : {}
  });
  const payload = {
    n: 1,
    seeds: [seedVal],
    modelId: "sora",
    modelVersion: engine === "sora2-pro" ? "sora-2-pro" : "sora-2",
    size: vidSize,
    duration,
    fps: 24,
    prompt: promptJson,
    generationMetadata: {
      module: sourceImageIds.length ? "image2video" : "text2video"
    },
    model: opts.modelSpec.upstreamModel,
    generateLoop: false,
    transparentBackground: false,
    seed: String(seedVal),
    locale: "en-US",
    camera: {
      angle: "none",
      shotSize: "none",
      motion: null,
      promptStyle: null
    },
    negativePrompt: negative,
    jobMode: "standard",
    debugGenerationEndpoint: "",
    referenceBlobs: [],
    referenceFrames: [],
    referenceVideo: null,
    cameraMotionReferenceVideo: null,
    characterReference: null,
    editReferenceVideo: null,
    output: { storeInputs: true }
  };
  if (sourceImageIds.length) {
    const firstId = String(sourceImageIds[0]);
    payload.referenceBlobs = [{ id: firstId, usage: "general", promptReference: 1 }];
    const frames = [{ localBlobRef: firstId }, null];
    if (sourceImageIds.length > 1) {
      const lastId = String(sourceImageIds[1]);
      payload.referenceBlobs.push({
        id: lastId,
        usage: "general",
        promptReference: 2
      });
      frames[1] = { localBlobRef: lastId };
    }
    payload.referenceFrames = frames;
  }
  return payload;
}
function browserHeaders() {
  return {
    "user-agent": DEFAULT_USER_AGENT,
    origin: FIREFLY_ORIGIN,
    referer: FIREFLY_REFERER,
    "accept-language": "en-US,en;q=0.9",
    "sec-ch-ua": DEFAULT_SEC_CH_UA,
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-site": "cross-site",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty"
  };
}
function generateAdobeNonce() {
  const bytes = new Uint8Array(32);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
function buildAdobeSubmitNonce(accessToken, prompt) {
  const userId = extractAdobeAccountIdFromToken(accessToken);
  const promptPrefix = String(prompt || "").slice(0, 256);
  if (!userId || !promptPrefix) return "";
  return createHash("sha256").update(`${userId}-${promptPrefix}`, "utf8").digest("hex");
}
const ADOBE_FIREFLY_ARKOSE_PUBLIC_KEY = "BBCC314C-4937-4CCD-B0A3-FDF0F0F7603C";
const ADOBE_FIREFLY_FTR_MAGIC = "__UDF43-m4_31ck";
function isValidAdobeArpSessionId(value) {
  const t = String(value || "").trim();
  if (t.length < 4) return false;
  if (/^[A-Za-z_][A-Za-z0-9_.%-]*=/.test(t) && !t.startsWith("eyJ")) return false;
  try {
    const padded = t + "=".repeat((4 - t.length % 4) % 4);
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(json)) return false;
    const obj = JSON.parse(json);
    return typeof obj.sid === "string" && obj.sid.length > 0;
  } catch {
    if (/=.+/.test(t.replace(/=+$/, ""))) return false;
    return !looksLikeAdobeJwt(t) && /^[A-Za-z0-9+/_=-]+$/.test(t);
  }
}
function buildAdobeArpSessionId(region = "eu-west-1") {
  const nowMs = Date.now();
  const sid = randomUUID();
  const randHex = randomBytes(16).toString("hex");
  const mid = randomBytes(12).toString("base64url");
  const n = 1e3 + Math.floor(Math.random() * 9e3);
  const ftr = `${randHex}_${nowMs}${ADOBE_FIREFLY_FTR_MAGIC}_${mid}=-${n}-v2_tt`;
  const arkSession = `${randomBytes(8).toString("hex")}.${Math.random().toFixed(10).slice(2)}`;
  const ark = `${arkSession}|r=${region}|meta=3|metabgclr=transparent|metaiconclr=%23757575|guitextcolor=%23000000|pk=${ADOBE_FIREFLY_ARKOSE_PUBLIC_KEY}|at=40|sup=1|rid=13|ag=101|cdn_url=https%3A%2F%2Farks-client.adobe.com%2Fcdn%2Ffc|surl=https%3A%2F%2Farks-client.adobe.com|smurl=https%3A%2F%2Farks-client.adobe.com%2Fcdn%2Ffc%2Fassets%2Fstyle-manager`;
  const bfp = randomUUID();
  const fpjs = JSON.stringify({
    requestId: `${nowMs}.${randomBytes(3).toString("base64url")}`,
    visitorId: randomBytes(12).toString("base64url")
  });
  const raw = JSON.stringify({ sid, ark, bfp, ftr, fpjs });
  return Buffer.from(raw, "utf-8").toString("base64");
}
function extractAdobeArpSessionId(cookieOrBlob) {
  const raw = String(cookieOrBlob || "");
  if (!raw.trim()) return "";
  const candidates = [];
  const push = (v) => {
    if (!v) return;
    let t = v.trim().replace(/^["']|["']$/g, "").trim();
    try {
      if (/%[0-9A-Fa-f]{2}/.test(t)) t = decodeURIComponent(t);
    } catch {
    }
    if (t) candidates.push(t);
  };
  const m = raw.match(/(?:^|[;\s\n\r])sherlockToken=([^;\s\n\r]+)/i);
  if (m?.[1]) push(m[1]);
  const m2 = raw.match(/(?:^|[;\s\n\r])x-arp-session-id=([^;\s\n\r]+)/i);
  if (m2?.[1]) push(m2[1]);
  const m3 = raw.match(/["']?x-arp-session-id["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{40,})["']?/i);
  if (m3?.[1]) push(m3[1]);
  const m4 = raw.match(/["']?sherlockToken["']?\s*[:=]\s*["']?([A-Za-z0-9+/=_-]{40,})["']?/i);
  if (m4?.[1]) push(m4[1]);
  for (const line of raw.split(/[\r\n]+/)) {
    const t = line.trim().replace(/^["']|["']$/g, "");
    if (looksLikeAdobeJwt(t)) continue;
    if (t.length >= 40 && isValidAdobeArpSessionId(t)) push(t);
  }
  const withoutJwt = stripAdobeJwts(raw, " ");
  for (const token of withoutJwt.split(/[\s,;"']+/)) {
    let t = token.trim();
    const eq = t.indexOf("=");
    if (eq > 0 && eq < 40 && /^[A-Za-z0-9_.%-]+$/.test(t.slice(0, eq))) {
      const name = t.slice(0, eq).toLowerCase();
      if (name === "sherlocktoken" || name === "x-arp-session-id") {
        t = t.slice(eq + 1).trim();
      } else {
        continue;
      }
    }
    if (t.length >= 40 && isValidAdobeArpSessionId(t)) push(t);
  }
  const ranked = candidates.map((c) => c.replace(/^["']|["']$/g, "").trim()).filter((v) => isValidAdobeArpSessionId(v));
  ranked.sort((a, b) => scoreAdobeArpCandidate(b) - scoreAdobeArpCandidate(a));
  return ranked[0] || "";
}
function scoreAdobeArpCandidate(value) {
  let score = value.length;
  try {
    const padded = value + "=".repeat((4 - value.length % 4) % 4);
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8"
    );
    const obj = JSON.parse(json);
    if (typeof obj.sid === "string" && obj.sid) score += 1e3;
    if (typeof obj.ark === "string" && obj.ark.length > 20) score += 500;
    if (typeof obj.ftr === "string" && obj.ftr.includes(ADOBE_FIREFLY_FTR_MAGIC)) score += 200;
    if (typeof obj.ark === "string" && obj.ark.includes(ADOBE_FIREFLY_ARKOSE_PUBLIC_KEY))
      score += 100;
    if (typeof obj.bfp === "string" && obj.bfp.length >= 8) score += 150;
    if (typeof obj.fpjs === "string" && obj.fpjs.length > 10) score += 150;
  } catch {
  }
  return score;
}
function hasBrowserAdobeArpSession(sessionCookieOrBlob) {
  const blob = String(sessionCookieOrBlob || "");
  if (extractAdobeArpSessionId(blob)) return true;
  const sid = blob.match(/(?:^|[;\s])ff_session_guid=([^;\s]+)/i)?.[1];
  const ark = blob.match(/(?:^|[;\s])arkose=([^;\s]+)/i)?.[1];
  const ftr = blob.match(/(?:^|[;\s])forterToken=([^;\s]+)/i)?.[1] || blob.match(/(?:^|[;\s])forter=([^;\s]+)/i)?.[1];
  return Boolean(sid && ark && ftr && !/^[a-f0-9]{32},\d+$/i.test(ftr));
}
function resolveAdobeArpSessionId(sessionCookieOrBlob) {
  const blob = String(sessionCookieOrBlob || "");
  const getCookie = (name) => {
    const m = blob.match(new RegExp(`(?:^|[;\\s\\n\\r])${name}=([^;\\s\\n\\r]+)`, "i"));
    if (!m?.[1]) return "";
    let v = m[1].trim();
    try {
      if (/%[0-9A-Fa-f]{2}/.test(v)) v = decodeURIComponent(v);
    } catch {
    }
    return v;
  };
  const sid = getCookie("ff_session_guid");
  const ark = getCookie("arkose");
  let ftr = getCookie("forterToken") || getCookie("forter");
  try {
    if (/%[0-9A-Fa-f]{2}/.test(ftr)) ftr = decodeURIComponent(ftr);
  } catch {
  }
  if (ftr.endsWith("v2") && !ftr.endsWith("v2_tt")) ftr = `${ftr}_tt`;
  if (/^[a-f0-9]{32},\d+$/i.test(ftr)) ftr = "";
  if (sid && ark && ftr) {
    const bfp = getCookie("bfp");
    let fpjs = getCookie("fpjs");
    try {
      if (fpjs && /%[0-9A-Fa-f]{2}/.test(fpjs)) fpjs = decodeURIComponent(fpjs);
    } catch {
    }
    const obj = { sid, ark, ftr };
    if (bfp) obj.bfp = bfp;
    if (fpjs) obj.fpjs = fpjs;
    return Buffer.from(JSON.stringify(obj), "utf-8").toString("base64");
  }
  const extracted = extractAdobeArpSessionId(blob);
  if (extracted) return extracted;
  return buildAdobeArpSessionId();
}
function buildAdobeSubmitHeaders(accessToken, extras) {
  const cookieBlob = String(extras?.cookie || "").trim();
  const deterministic = extras?.nonce || (extras?.prompt ? buildAdobeSubmitNonce(accessToken, extras.prompt) : "") || generateAdobeNonce();
  const explicitArp = extras?.arpSessionId ? String(extras.arpSessionId).trim() : "";
  const arp = explicitArp || extractAdobeArpSessionId(cookieBlob) || buildAdobeArpSessionId();
  const headers = {
    ...browserHeaders(),
    Authorization: `Bearer ${accessToken}`,
    // Must be clio-playground-web — same client_id that minted the IMS token.
    "x-api-key": adobeFireflyApiKey(),
    "content-type": "application/json",
    accept: "*/*",
    "cache-control": "no-cache",
    pragma: "no-cache",
    priority: "u=1, i",
    "x-nonce": deterministic,
    "x-arp-session-id": arp
  };
  return headers;
}
const ADOBE_FIREFLY_MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
function buildAdobeUploadHeaders(accessToken, contentType, extras) {
  const base = buildAdobeSubmitHeaders(accessToken, {
    arpSessionId: extras?.arpSessionId,
    nonce: extras?.nonce,
    cookie: extras?.cookie,
    prompt: extras?.prompt || "upload"
  });
  const ct = String(contentType || "image/png").trim().toLowerCase() || "image/png";
  return {
    ...base,
    "content-type": ct.startsWith("image/") ? ct : "image/png"
  };
}
import {
  extractAdobeSourceImageReferences,
  normalizeAdobeReferenceBlobs
} from "./adobeFireflyReferences.js";
function extractAdobeSourceImageSources(body, max = 4) {
  if (!body || typeof body !== "object") return [];
  const b = body;
  const po = b.provider_options && typeof b.provider_options === "object" && !Array.isArray(b.provider_options) ? b.provider_options : {};
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  const push = (v) => {
    if (out.length >= max) return;
    if (typeof v === "string") {
      const t = v.trim();
      if (!t || seen.has(t)) return;
      if (t === "null" || t === "undefined") return;
      seen.add(t);
      out.push(t);
      return;
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        if (out.length >= max) break;
        push(item);
      }
      return;
    }
    if (v && typeof v === "object") {
      const o = v;
      if (typeof o.url === "string") push(o.url);
      else if (typeof o.image_url === "string") push(o.image_url);
      else if (o.image_url && typeof o.image_url === "object") {
        const inner = o.image_url.url;
        if (typeof inner === "string") push(inner);
      } else if (typeof o.b64_json === "string") {
        push(`data:image/png;base64,${o.b64_json}`);
      } else if (typeof o.base64 === "string") {
        push(`data:image/png;base64,${o.base64}`);
      }
    }
  };
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
  for (const k of keys) {
    push(b[k]);
    push(po[k]);
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
          push(p.image_url ?? p.image ?? p.url);
        }
      }
    }
  }
  return out.slice(0, max);
}
function parseAdobeImageSourceBytes(source) {
  const trimmed = String(source || "").trim();
  if (!trimmed) {
    throw new AdobeFireflyError("Empty image reference", 400, "bad_image");
  }
  const dataUri = /^data:([^;,]+)?(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i.exec(trimmed);
  if (dataUri) {
    const mime = (dataUri[1] || "image/png").trim().toLowerCase() || "image/png";
    const isB64 = Boolean(dataUri[2]);
    const payload = dataUri[3] || "";
    if (!isB64) {
      throw new AdobeFireflyError(
        "Image data URL must be base64-encoded (data:image/...;base64,...)",
        400,
        "bad_image"
      );
    }
    const buffer = Buffer.from(payload.replace(/\s/g, ""), "base64");
    if (!buffer.length) {
      throw new AdobeFireflyError("Image data URL decoded to empty bytes", 400, "bad_image");
    }
    if (buffer.length > ADOBE_FIREFLY_MAX_UPLOAD_BYTES) {
      throw new AdobeFireflyError(
        `Image reference too large (${buffer.length} bytes; max ${ADOBE_FIREFLY_MAX_UPLOAD_BYTES})`,
        400,
        "bad_image"
      );
    }
    return {
      buffer,
      contentType: mime.startsWith("image/") ? mime : "image/png"
    };
  }
  if (!/^https?:\/\//i.test(trimmed) && /^[A-Za-z0-9+/=\s]+$/.test(trimmed) && trimmed.length > 64) {
    const buffer = Buffer.from(trimmed.replace(/\s/g, ""), "base64");
    if (buffer.length > 0 && buffer.length <= ADOBE_FIREFLY_MAX_UPLOAD_BYTES) {
      return { buffer, contentType: "image/png" };
    }
  }
  throw new AdobeFireflyError(
    "Unsupported image reference (need data:image/...;base64,... or raw base64). HTTP(S) URLs are resolved by the caller before upload.",
    400,
    "bad_image"
  );
}
function parseAdobeStorageUploadResponse(body) {
  if (!body || typeof body !== "object") return "";
  const images = body.images;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    if (first && typeof first === "object") {
      const id2 = first.id;
      if (typeof id2 === "string" && id2.trim()) return id2.trim();
    }
  }
  const id = body.id;
  if (typeof id === "string" && id.trim()) return id.trim();
  return "";
}
async function uploadAdobeFireflyImage(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const buffer = Buffer.isBuffer(opts.bytes) ? opts.bytes : Buffer.from(opts.bytes);
  if (!buffer.length) {
    throw new AdobeFireflyError("Cannot upload empty image", 400, "bad_image");
  }
  if (buffer.length > ADOBE_FIREFLY_MAX_UPLOAD_BYTES) {
    throw new AdobeFireflyError(
      `Image reference too large (${buffer.length} bytes; max ${ADOBE_FIREFLY_MAX_UPLOAD_BYTES})`,
      400,
      "bad_image"
    );
  }
  const sessionCookie = String(opts.sessionCookie || "").trim();
  const cookieHeader = extractAdobeCookieHeader(sessionCookie);
  const arpSessionId = opts.arpSessionId && String(opts.arpSessionId).trim() || resolveAdobeArpSessionId(cookieHeader || sessionCookie);
  const contentType = opts.contentType && opts.contentType.trim() || (buffer[0] === 255 && buffer[1] === 216 ? "image/jpeg" : buffer[0] === 137 && buffer[1] === 80 ? "image/png" : "image/png");
  const resp = await fetchImpl(ADOBE_FIREFLY_IMAGE_UPLOAD_URL, {
    method: "POST",
    headers: buildAdobeUploadHeaders(opts.accessToken, contentType, {
      arpSessionId,
      cookie: cookieHeader || void 0,
      prompt: opts.prompt || "upload"
    }),
    body: Uint8Array.from(buffer)
  });
  const text = await resp.text().catch(() => "");
  if (resp.status === 401 || resp.status === 403) {
    throw new AdobeFireflyError(
      "Adobe Firefly image upload unauthorized \u2014 paste a fresh IMS JWT",
      401,
      "auth"
    );
  }
  if (!resp.ok) {
    throw new AdobeFireflyError(
      `Adobe Firefly image upload failed (${resp.status}): ${sanitizeErrorMessage(text.slice(0, 300))}`,
      resp.status >= 400 && resp.status < 500 ? resp.status : 502,
      "upload"
    );
  }
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    throw new AdobeFireflyError("Adobe Firefly image upload returned non-JSON body", 502, "upload");
  }
  const id = parseAdobeStorageUploadResponse(json);
  if (!id) {
    throw new AdobeFireflyError(
      "Adobe Firefly image upload succeeded but no images[].id was returned",
      502,
      "upload"
    );
  }
  opts.log?.info?.("ADOBE-FIREFLY", `uploaded reference image id=${id} (${buffer.length} bytes)`);
  return id;
}
async function resolveAdobeSourceImageIds(opts) {
  const max = Math.max(1, Math.min(8, opts.max ?? 4));
  const sources = extractAdobeSourceImageSources(opts.body, max);
  if (!sources.length) return [];
  const fetchImpl = opts.fetchImpl || fetch;
  const ids = [];
  const arpSessionId = opts.arpSessionId && String(opts.arpSessionId).trim() || resolveAdobeArpSessionId(opts.sessionCookie);
  for (const src of sources) {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(src)) {
      ids.push(src);
      continue;
    }
    let buffer;
    let contentType = "image/png";
    if (/^https?:\/\//i.test(src)) {
      const r = await fetchImpl(src, {
        method: "GET",
        headers: { accept: "image/*,*/*" }
      });
      if (!r.ok) {
        throw new AdobeFireflyError(
          `Failed to download reference image (${r.status}): ${src.slice(0, 120)}`,
          400,
          "bad_image"
        );
      }
      const ab = await r.arrayBuffer();
      buffer = Buffer.from(ab);
      const ct = r.headers.get("content-type") || "";
      if (ct.toLowerCase().startsWith("image/")) {
        contentType = ct.split(";")[0].trim();
      }
    } else {
      const parsed = parseAdobeImageSourceBytes(src);
      buffer = parsed.buffer;
      contentType = parsed.contentType;
    }
    const id = await uploadAdobeFireflyImage({
      accessToken: opts.accessToken,
      bytes: buffer,
      contentType,
      sessionCookie: opts.sessionCookie,
      arpSessionId,
      prompt: opts.prompt,
      fetchImpl,
      log: opts.log
    });
    ids.push(id);
  }
  return ids;
}
function isAdobeTransientSubmitError(status, bodyText) {
  if (status === 408 || status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }
  const t = (bodyText || "").toLowerCase();
  return t.includes("timeout_error") || t.includes("system under load") || t.includes("try again") || t.includes("temporarily") || t.includes("overloaded");
}
function buildAdobePollHeaders(accessToken) {
  return {
    Authorization: `Bearer ${accessToken}`,
    accept: "*/*",
    "cache-control": "no-cache",
    pragma: "no-cache",
    "user-agent": DEFAULT_USER_AGENT,
    referer: FIREFLY_REFERER
  };
}
function buildAdobeBalanceHeaders(accessToken) {
  const accountId = extractAdobeAccountIdFromToken(accessToken);
  const headers = {
    ...browserHeaders(),
    Authorization: `Bearer ${accessToken}`,
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": adobeFireflyBalanceApiKey()
  };
  if (accountId) headers["x-account-id"] = accountId;
  return headers;
}
function buildAdobeDiscoveryHeaders(accessToken) {
  return {
    ...browserHeaders(),
    Authorization: `Bearer ${accessToken}`,
    "x-api-key": adobeFireflyApiKey(),
    "content-type": "application/json",
    // Missing Accept → HTTP 406 "Unsupported Accept Type or not allowed".
    accept: "*/*"
  };
}
function formatAdobeSystemUnderLoadError(kind, attempts, opts) {
  const hadArp = opts?.hadBrowserArp === true;
  if (!hadArp) {
    return `Adobe Firefly ${kind} generation failed (HTTP 408 "system under load", after ${attempts} attempt${attempts === 1 ? "" : "s"}). Your credential is missing a browser x-arp-session-id / sherlockToken (JWT alone almost always 408s even when credits/Limits work). Re-open the Adobe Firefly account and paste TWO lines from a SUCCESSFUL firefly-3p.ff.adobe.io generate-async request (F12 \u2192 Network): (1) Authorization token AFTER "Bearer " (eyJ\u2026 JWT), (2) the raw x-arp-session-id header value OR Cookie containing sherlockToken. Use the multi-line credential box so both lines are kept.`;
  }
  return `Adobe Firefly ${kind} generation failed (HTTP 408 "system under load", after ${attempts} attempt${attempts === 1 ? "" : "s"}). JWT was accepted for balance/discovery but colligo rejected the risk session (Forter/Arkose stale or rate-limited). The app spaces submits, sticks to the last working x-arp-session-id, and on 408 auto-warms Forter/ARP via off-screen Chrome CDP (true headless is rejected by colligo \u2014 set ADOBE_FIREFLY_CHROME_HEADLESS=1 only for debug). Paste the full firefly.adobe.com Cookie once with the JWT so recovery can run. If it still fails after that, open firefly.adobe.com, generate one image in-browser, then paste a FRESH multi-line credential (JWT + Cookie) once.`;
}
function extractAdobeResultLink(headers, body) {
  const get = (name) => {
    if (typeof headers.get === "function") {
      return String(headers.get(name) || "").trim();
    }
    const rec = headers;
    const key = Object.keys(rec).find((k) => k.toLowerCase() === name.toLowerCase());
    return String((key ? rec[key] : "") || "").trim();
  };
  const override = get("x-override-status-link");
  if (override) return override;
  const data = body && typeof body === "object" ? body : {};
  const links = data.links && typeof data.links === "object" ? data.links : {};
  const result = links.result;
  if (typeof result === "string" && result) return result;
  if (result && typeof result === "object") {
    const href = result.href;
    if (typeof href === "string" && href) return href;
  }
  if (typeof data.statusUrl === "string" && data.statusUrl) return data.statusUrl;
  if (typeof data.resultUrl === "string" && data.resultUrl) return data.resultUrl;
  return "";
}
function normalizeAdobePollUrl(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url) return url;
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (!host.startsWith("firefly-epo")) return url;
    const path = parsed.pathname || "";
    const isJobPath = path.includes("/jobs/result/") || path.includes("/v2/status") || path.includes("/status/");
    if (!isJobPath) return url;
    const jobId = path.split("/").filter(Boolean).pop() || "";
    if (!jobId || jobId === "status" || jobId === "result") return url;
    const epoId = host.slice("firefly-epo".length).split(".")[0] || "";
    const bksId = epoId.length > 4 ? epoId.slice(0, 4) : epoId;
    return `https://bks-epo${bksId}.adobe.io/v2/jobs/result/${jobId}?host=${host}`;
  } catch {
    return url;
  }
}
function extractAdobeMediaUrl(latest, kind) {
  const body = latest && typeof latest === "object" ? latest : {};
  const outputs = Array.isArray(body.outputs) ? body.outputs : [];
  if (outputs.length > 0) {
    const first = outputs[0] && typeof outputs[0] === "object" ? outputs[0] : {};
    const media = kind === "image" ? first.image && typeof first.image === "object" ? first.image : null : first.video && typeof first.video === "object" ? first.video : null;
    const url = media && typeof media.presignedUrl === "string" ? media.presignedUrl : null;
    if (url) return url;
  }
  const found = findPresignedUrl(
    latest,
    kind === "image" ? [".png", ".jpg", ".jpeg", ".webp"] : [".mp4", ".webm"]
  );
  return found;
}
function findPresignedUrl(obj, exts) {
  if (!obj) return null;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (/^https?:\/\//i.test(s) && (exts.some((e) => s.toLowerCase().includes(e)) || s.includes("presigned") || s.includes("X-Amz"))) {
      return s;
    }
    return null;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findPresignedUrl(item, exts);
      if (found) return found;
    }
    return null;
  }
  if (typeof obj === "object") {
    const rec = obj;
    if (typeof rec.presignedUrl === "string" && rec.presignedUrl) return rec.presignedUrl;
    for (const value of Object.values(rec)) {
      const found = findPresignedUrl(value, exts);
      if (found) return found;
    }
  }
  return null;
}
function isAdobeJobInProgress(status) {
  const s = String(status || "").toUpperCase();
  return !s || s === "IN_PROGRESS" || s === "PENDING" || s === "RUNNING" || s === "QUEUED" || s === "PROCESSING" || s === "SUBMITTED";
}
function isAdobeJobFailed(status) {
  const s = String(status || "").toUpperCase();
  return s === "FAILED" || s === "CANCELLED" || s === "ERROR" || s === "CANCELED";
}
async function imsCheckToken(opts) {
  const form = new URLSearchParams({
    client_id: opts.clientId,
    scope: ADOBE_FIREFLY_IMS_SCOPE,
    guest_allowed: opts.guestAllowed ? "true" : "false"
  });
  const resp = await opts.fetchImpl(ADOBE_FIREFLY_IMS_REFRESH_URL, {
    method: "POST",
    headers: {
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      Cookie: opts.cookie,
      Origin: FIREFLY_ORIGIN,
      Referer: FIREFLY_REFERER,
      "User-Agent": DEFAULT_USER_AGENT
    },
    body: form.toString()
  });
  const text = await resp.text().catch(() => "");
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!resp.ok) {
    return {
      ok: false,
      status: resp.status,
      error: sanitizeErrorMessage(
        data?.error_description || data?.error || text.slice(0, 200) || `HTTP ${resp.status}`
      )
    };
  }
  const token = String(data?.access_token || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: sanitizeErrorMessage(
        data?.error_description || data?.error || "IMS response missing access_token"
      )
    };
  }
  return { ok: true, token, data: data || {} };
}
async function exchangeAdobeCookieForAccessToken(cookieHeader, fetchImpl = fetch) {
  const cookie = String(cookieHeader || "").trim();
  if (!cookie) {
    throw new AdobeFireflyError("Adobe Firefly cookie is empty", 401, "missing_cookie");
  }
  const embedded = extractAdobeCredentialToken(cookie);
  if (embedded !== cookie && looksLikeAdobeJwt(embedded)) {
    if (isAdobeGuestAccessToken(embedded)) {
      throw new AdobeFireflyError(GUEST_COOKIE_HELP, 401, "guest_token");
    }
    return embedded;
  }
  const clientIds = [adobeFireflyApiKey(), adobeFireflyExpressClientId()].filter(
    (id, i, arr) => id && arr.indexOf(id) === i
  );
  let sawEmptySession = false;
  let lastError = "";
  let lastStatus = 502;
  let guestTokenSeen = false;
  for (const clientId of clientIds) {
    const authed = await imsCheckToken({
      cookie,
      clientId,
      guestAllowed: false,
      fetchImpl
    });
    if (authed.ok === true) {
      if (isAdobeGuestAccessToken(authed.token) || authed.data.account_type === "guest" || authed.data.guestId) {
        guestTokenSeen = true;
      } else {
        return authed.token;
      }
    } else {
      lastStatus = authed.status;
      lastError = authed.error;
      if (/session cookies are empty/i.test(authed.error)) sawEmptySession = true;
    }
    const guest = await imsCheckToken({
      cookie,
      clientId,
      guestAllowed: true,
      fetchImpl
    });
    if (guest.ok === true) {
      if (guest.data.account_type === "guest" || guest.data.guestId || isAdobeGuestAccessToken(guest.token)) {
        guestTokenSeen = true;
        lastError = "IMS returned a guest token (no AdobeID session)";
        lastStatus = 401;
        continue;
      }
      return guest.token;
    }
    lastStatus = guest.status;
    lastError = guest.error;
    if (/session cookies are empty/i.test(guest.error)) sawEmptySession = true;
  }
  if (guestTokenSeen || sawEmptySession) {
    throw new AdobeFireflyError(GUEST_COOKIE_HELP, 401, "guest_token");
  }
  throw new AdobeFireflyError(
    `Adobe IMS token exchange failed (${lastStatus}): ${lastError || "no access_token"}. ${GUEST_COOKIE_HELP}`,
    lastStatus === 401 || lastStatus === 403 ? 401 : 502,
    "ims_refresh_failed"
  );
}
async function resolveAdobeAccessToken(credentials, fetchImpl = fetch) {
  const psd = credentials?.providerSpecificData;
  const candidates = [];
  const push = (v) => {
    if (typeof v === "string" && v.trim()) candidates.push(v.trim());
  };
  push(credentials?.apiKey);
  push(credentials?.accessToken);
  push(psd?.access_token);
  push(psd?.accessToken);
  push(psd?.cookie);
  if (candidates.length === 0) {
    throw new AdobeFireflyError(
      "Adobe Firefly credentials missing. " + GUEST_COOKIE_HELP,
      401,
      "missing_credentials"
    );
  }
  for (const c of candidates) {
    const extracted = extractAdobeCredentialToken(c);
    if (looksLikeAdobeJwt(extracted) && isAdobeUserAccessToken(extracted)) {
      return extracted;
    }
  }
  for (const c of candidates) {
    const extracted = extractAdobeCredentialToken(c);
    if (looksLikeAdobeJwt(extracted) && isAdobeGuestAccessToken(extracted)) {
      throw new AdobeFireflyError(GUEST_COOKIE_HELP, 401, "guest_token");
    }
  }
  const cookieBlob = candidates.find(
    (c) => c.includes(";") || c.toLowerCase().includes("aux_sid") || c.toLowerCase().includes("ff_session")
  ) || candidates[0];
  const token = await exchangeAdobeCookieForAccessToken(cookieBlob, fetchImpl);
  if (isAdobeGuestAccessToken(token)) {
    throw new AdobeFireflyError(GUEST_COOKIE_HELP, 401, "guest_token");
  }
  return token;
}
function readQuotaBlock(block) {
  if (!block || typeof block !== "object") return { total: 0, used: 0, available: 0 };
  const q = block.quota && typeof block.quota === "object" ? block.quota : block;
  const total = Number(q.total ?? 0);
  const used = Number(q.used ?? 0);
  const available = Number(q.available ?? Math.max(0, total - used));
  return {
    total: Number.isFinite(total) ? total : 0,
    used: Number.isFinite(used) ? used : 0,
    available: Number.isFinite(available) ? available : 0
  };
}
function parseAdobeCreditsBalance(body) {
  const root = body && typeof body === "object" ? body : {};
  const totalBlock = readQuotaBlock(root.total);
  const credits = root.credits && typeof root.credits === "object" ? root.credits : {};
  const free = readQuotaBlock(credits.firefly_free_credit);
  const plan = readQuotaBlock(credits.firefly_plan_credit);
  let total = totalBlock.total;
  let used = totalBlock.used;
  let remaining = totalBlock.available;
  if (total <= 0 && (free.total > 0 || plan.total > 0)) {
    total = free.total + plan.total;
    used = free.used + plan.used;
    remaining = free.available + plan.available;
  }
  if (remaining <= 0 && total > 0) remaining = Math.max(0, total - used);
  const availableUntil = root.total && typeof root.total === "object" && typeof root.total.availableUntil === "string" ? String(root.total.availableUntil) : null;
  return {
    total,
    used,
    remaining,
    availableUntil,
    freeTotal: free.total,
    freeUsed: free.used,
    freeRemaining: free.available,
    planTotal: plan.total,
    planUsed: plan.used,
    planRemaining: plan.available,
    raw: body
  };
}
async function fetchAdobeCreditsBalance(accessToken, fetchImpl = fetch) {
  const resp = await fetchImpl(ADOBE_FIREFLY_CREDITS_BALANCE_URL, {
    method: "GET",
    headers: buildAdobeBalanceHeaders(accessToken)
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new AdobeFireflyError("Adobe Firefly balance: token invalid or expired", 401, "auth");
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AdobeFireflyError(
      `Adobe Firefly balance failed (${resp.status}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
      502
    );
  }
  const data = await resp.json().catch(() => ({}));
  return parseAdobeCreditsBalance(data);
}
function parseAdobeModelsDiscovery(body) {
  return parseAdobeModelsDiscoveryContract(body);
}
async function discoverAdobeFireflyModels(accessToken, fetchImpl = fetch) {
  const resp = await fetchImpl(ADOBE_FIREFLY_MODELS_DISCOVERY_URL, {
    method: "POST",
    headers: buildAdobeDiscoveryHeaders(accessToken),
    body: JSON.stringify({ filters: { resolveSchema: true } })
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new AdobeFireflyError(
      "Adobe Firefly model discovery: token invalid or expired",
      401,
      "auth"
    );
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AdobeFireflyError(
      `Adobe Firefly model discovery failed (${resp.status}): ${sanitizeErrorMessage(text.slice(0, 200))}`,
      502
    );
  }
  const data = await resp.json().catch(() => ({}));
  return parseAdobeModelsDiscovery(data);
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
async function pollAdobeJob(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const deadline = Date.now() + opts.timeoutMs;
  const interval = opts.pollIntervalMs && opts.pollIntervalMs > 0 ? opts.pollIntervalMs : DEFAULT_POLL_INTERVAL_MS;
  let attempt = 0;
  let latest = {};
  let accessToken = opts.accessToken;
  let authRefreshAttempted = false;
  while (Date.now() < deadline) {
    attempt += 1;
    const pollResp = await fetchImpl(opts.pollUrl, {
      method: "GET",
      headers: buildAdobePollHeaders(accessToken)
    });
    if (pollResp.status === 401 || pollResp.status === 403) {
      const accessError = pollResp.headers.get("x-access-error") || "";
      if (accessError === "taste_exhausted") {
        throw new AdobeFireflyError(
          "Adobe Firefly quota exhausted for this account",
          429,
          "quota_exhausted"
        );
      }
      if (!authRefreshAttempted && opts.sessionCookie) {
        authRefreshAttempted = true;
        try {
          const {
            rotateAdobeFireflySessionOnError,
            fingerprintAdobeCredential,
            estimateAdobeTokenExpiry
          } = await import("./adobeFireflySession.js");
          const fp = String(opts.sessionFingerprint || "").trim() || fingerprintAdobeCredential(
            [accessToken, opts.sessionCookie].filter(Boolean).join("\n")
          );
          const refreshed = await rotateAdobeFireflySessionOnError(
            {
              accessToken,
              cookie: opts.sessionCookie,
              arpSessionId: "",
              tokenExpiresAt: estimateAdobeTokenExpiry(accessToken),
              updatedAt: Date.now(),
              fingerprint: fp,
              source: "rebuild"
            },
            { attempt: 3, authFailure: true, tryBrowser: true, log: opts.log }
          );
          if (refreshed?.accessToken && isAdobeUserAccessToken(refreshed.accessToken)) {
            accessToken = refreshed.accessToken;
            opts.log?.info?.(
              "ADOBE-FIREFLY",
              `poll auth ${pollResp.status}; retrying once with renewed JWT`
            );
            continue;
          }
        } catch {
        }
      }
      throw new AdobeFireflyError("Adobe Firefly token invalid or expired", 401, "auth");
    }
    if (!pollResp.ok) {
      const text = await pollResp.text().catch(() => "");
      if (pollResp.status === 408 || pollResp.status === 429 || pollResp.status === 451 || pollResp.status >= 500 || isAdobeTransientSubmitError(pollResp.status, text)) {
        opts.log?.info?.("ADOBE-FIREFLY", `poll temporary ${pollResp.status}, attempt #${attempt}`);
        await sleep(interval);
        continue;
      }
      throw new AdobeFireflyError(
        `Adobe Firefly poll failed (${pollResp.status}): ${sanitizeErrorMessage(text.slice(0, 300))}`,
        502
      );
    }
    latest = await pollResp.json().catch(() => ({}));
    const statusHeader = String(pollResp.headers.get("x-task-status") || "").toUpperCase();
    const statusVal = String(
      (latest && typeof latest === "object" ? latest.status : "") || statusHeader || ""
    ).toUpperCase();
    const mediaUrl = extractAdobeMediaUrl(latest, opts.kind);
    if (mediaUrl) {
      return { mediaUrl, latest };
    }
    if (isAdobeJobFailed(statusVal)) {
      throw new AdobeFireflyError(
        `Adobe Firefly ${opts.kind} job failed: ${sanitizeErrorMessage(JSON.stringify(latest).slice(0, 300))}`,
        502,
        "job_failed"
      );
    }
    opts.log?.info?.(
      "ADOBE-FIREFLY",
      `${opts.kind} pending #${attempt} status=${statusVal || "unknown"}`
    );
    await sleep(interval);
  }
  throw new AdobeFireflyError(`Adobe Firefly ${opts.kind} generation timed out`, 504, "timeout");
}
const SUBMIT_MAX_ATTEMPTS = 5;
function submitBaseDelayMs() {
  if (process.env.ADOBE_FIREFLY_SUBMIT_BASE_DELAY_MS != null && process.env.ADOBE_FIREFLY_SUBMIT_BASE_DELAY_MS !== "") {
    return Math.max(0, Number(process.env.ADOBE_FIREFLY_SUBMIT_BASE_DELAY_MS) || 0);
  }
  if (process.env.NODE_ENV === "test" || process.env.VITEST || process.env.NODE_TEST_CONTEXT)
    return 20;
  return 8e3;
}
async function adobeFireflyGenerateImage(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const { spec } = resolveAdobeImageModel(opts.model);
  const aspectRatio = normalizeAdobeAspectRatio(opts.aspectRatio ?? opts.size, "1:1");
  const outputResolution = normalizeAdobeOutputResolution(opts.quality, opts.size);
  const payload = buildAdobeImagePayload({
    prompt: opts.prompt,
    aspectRatio,
    outputResolution,
    modelSpec: spec,
    quality: opts.quality,
    seed: opts.seed,
    sourceImageIds: opts.sourceImageIds,
    negativePrompt: opts.negativePrompt
  });
  const sessionCookie = String(opts.sessionCookie || "").trim();
  let activeCookie = extractAdobeCookieHeader(sessionCookie) || sessionCookie;
  const hadBrowserArp = hasBrowserAdobeArpSession(activeCookie);
  let arpSessionId = opts.arpSessionId && String(opts.arpSessionId).trim() || resolveAdobeArpSessionId(activeCookie);
  let submitData = {};
  let submitHeaders = new Headers();
  let lastSubmitError = "";
  let sawSystemUnderLoad = false;
  let accessToken = opts.accessToken;
  let authRefreshAttempted = false;
  const {
    withAdobeFireflySubmitGate,
    markAdobeFireflyArpSuccess,
    noteAdobeFireflySubmitFailure,
    rotateAdobeFireflySessionOnError,
    resolveAdobeArpSessionIdSmart,
    fingerprintAdobeCredential,
    estimateAdobeTokenExpiry
  } = await import("./adobeFireflySession.js");
  const fingerprint = String(opts.sessionFingerprint || "").trim() || fingerprintAdobeCredential([accessToken, activeCookie].filter(Boolean).join("\n"));
  const browserSessionKey = String(opts.sessionBrowserKey || "").trim() || fingerprint;
  let submitOk = false;
  for (let attempt = 1; attempt <= SUBMIT_MAX_ATTEMPTS; attempt++) {
    const submitResp = await withAdobeFireflySubmitGate(
      () => fetchImpl(ADOBE_FIREFLY_IMAGE_SUBMIT_URL, {
        method: "POST",
        headers: buildAdobeSubmitHeaders(accessToken, {
          arpSessionId,
          prompt: opts.prompt,
          cookie: activeCookie || void 0
        }),
        body: JSON.stringify(payload)
      })
    );
    if (submitResp.status === 401 || submitResp.status === 403) {
      noteAdobeFireflySubmitFailure();
      const accessError = submitResp.headers.get("x-access-error") || "";
      if (accessError === "taste_exhausted") {
        throw new AdobeFireflyError(
          "Adobe Firefly quota exhausted for this account",
          429,
          "quota_exhausted"
        );
      }
      if (!authRefreshAttempted && attempt < SUBMIT_MAX_ATTEMPTS) {
        authRefreshAttempted = true;
        const refreshed = await rotateAdobeFireflySessionOnError(
          {
            accessToken,
            cookie: activeCookie,
            arpSessionId,
            tokenExpiresAt: estimateAdobeTokenExpiry(accessToken),
            updatedAt: Date.now(),
            fingerprint,
            browserSessionKey,
            source: "rebuild"
          },
          { attempt, authFailure: true, tryBrowser: true, log: opts.log }
        ).catch(() => null);
        if (refreshed?.accessToken && refreshed?.arpSessionId) {
          accessToken = refreshed.accessToken;
          activeCookie = refreshed.cookie || activeCookie;
          arpSessionId = refreshed.arpSessionId;
          opts.log?.info?.(
            "ADOBE-FIREFLY",
            `image submit auth ${submitResp.status}; retrying once with renewed CDP session`
          );
          continue;
        }
      }
      throw new AdobeFireflyError(
        "Adobe Firefly session is no longer authenticated and automatic browser renewal failed. Sign in once through the Adobe Firefly browser login to restore durable renewal.",
        401,
        "auth"
      );
    }
    if (!submitResp.ok) {
      const text = await submitResp.text().catch(() => "");
      if (isAdobeTransientSubmitError(submitResp.status, text)) {
        sawSystemUnderLoad = true;
      }
      lastSubmitError = `Adobe Firefly image submit failed (${submitResp.status}): ${sanitizeErrorMessage(text.slice(0, 300))}`;
      if (isAdobeTransientSubmitError(submitResp.status, text) && attempt < SUBMIT_MAX_ATTEMPTS) {
        const { getAdobeForterAgeMs: forterAgeMsFn, extractAdobeForterTimestampMs: forterTsFn } = await import("./adobeFireflySession.js");
        const forterTs = forterTsFn(activeCookie || "");
        const forterAgeBefore = forterAgeMsFn(activeCookie || "");
        const forterKnownStale = forterTs > 0 && Number.isFinite(forterAgeBefore) && forterAgeBefore > 4 * 6e4;
        if (forterKnownStale && attempt >= 2) {
          noteAdobeFireflySubmitFailure();
          throw new AdobeFireflyError(
            formatAdobeSystemUnderLoadError("image", attempt, { hadBrowserArp }) + " Risk session looks expired \u2014 open Providers \u2192 Adobe Firefly \u2192 Sign in with browser once.",
            408,
            "system_under_load"
          );
        }
        try {
          if (activeCookie) {
            const rotated = await rotateAdobeFireflySessionOnError(
              {
                accessToken,
                cookie: activeCookie,
                arpSessionId,
                tokenExpiresAt: estimateAdobeTokenExpiry(accessToken),
                updatedAt: Date.now(),
                fingerprint,
                browserSessionKey,
                source: "rebuild"
              },
              {
                // Stale forter warms immediately; fresh forter quiet-reuses on 1–2 then warms.
                attempt,
                tryBrowser: process.env.ADOBE_FIREFLY_BROWSER_REFRESH !== "0",
                log: opts.log
              }
            );
            accessToken = rotated.accessToken || accessToken;
            activeCookie = rotated.cookie || activeCookie;
            arpSessionId = rotated.arpSessionId;
          } else {
            arpSessionId = resolveAdobeArpSessionIdSmart(sessionCookie, {
              rotate: true
            });
          }
        } catch {
        }
        const base = submitBaseDelayMs();
        const delay = base <= 50 ? base : Math.min(9e4, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1500);
        opts.log?.info?.(
          "ADOBE-FIREFLY",
          `image submit transient ${submitResp.status}, retry ${attempt}/${SUBMIT_MAX_ATTEMPTS} in ${delay}ms (recovery attempt=${attempt})`
        );
        await sleep(delay);
        continue;
      }
      noteAdobeFireflySubmitFailure();
      if (sawSystemUnderLoad && isAdobeTransientSubmitError(submitResp.status, text)) {
        throw new AdobeFireflyError(
          formatAdobeSystemUnderLoadError("image", attempt, {
            hadBrowserArp
          }),
          408,
          "system_under_load"
        );
      }
      throw new AdobeFireflyError(
        lastSubmitError,
        submitResp.status >= 400 && submitResp.status < 500 ? submitResp.status : 502
      );
    }
    submitData = await submitResp.json().catch(() => ({}));
    submitHeaders = submitResp.headers;
    markAdobeFireflyArpSuccess(fingerprint, arpSessionId);
    submitOk = true;
    break;
  }
  if (!submitOk && !lastSubmitError) {
    throw new AdobeFireflyError(
      formatAdobeSystemUnderLoadError("image", SUBMIT_MAX_ATTEMPTS, { hadBrowserArp }),
      408,
      "system_under_load"
    );
  }
  let pollUrl = extractAdobeResultLink(submitHeaders, submitData);
  if (!pollUrl) {
    if (sawSystemUnderLoad) {
      throw new AdobeFireflyError(
        formatAdobeSystemUnderLoadError("image", SUBMIT_MAX_ATTEMPTS, {
          hadBrowserArp
        }),
        408,
        "system_under_load"
      );
    }
    throw new AdobeFireflyError(
      lastSubmitError || "Adobe Firefly image submit succeeded but no poll URL was returned",
      502
    );
  }
  pollUrl = normalizeAdobePollUrl(pollUrl);
  const { mediaUrl, latest } = await pollAdobeJob({
    pollUrl,
    accessToken,
    kind: "image",
    timeoutMs: opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_IMAGE_TIMEOUT_MS,
    fetchImpl,
    log: opts.log
  });
  return { url: mediaUrl, latest };
}
async function adobeFireflyGenerateVideo(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const { spec } = resolveAdobeVideoModel(opts.model);
  const aspectRatio = normalizeAdobeAspectRatio(opts.aspectRatio ?? opts.size, "16:9");
  const duration = typeof opts.duration === "number" ? opts.duration : typeof opts.duration === "string" && opts.duration.trim() ? Number(opts.duration) : spec.defaultDuration;
  const resolution = typeof opts.resolution === "string" && opts.resolution.trim() ? opts.resolution : typeof opts.quality === "string" && /p$/i.test(opts.quality) ? opts.quality : spec.defaultResolution;
  const payload = buildAdobeVideoPayload({
    prompt: opts.prompt,
    aspectRatio,
    duration: Number.isFinite(duration) ? Number(duration) : spec.defaultDuration,
    modelSpec: spec,
    resolution,
    seed: opts.seed,
    sourceImageIds: opts.sourceImageIds,
    negativePrompt: opts.negativePrompt,
    generateAudio: opts.generateAudio
  });
  const sessionCookie = String(opts.sessionCookie || "").trim();
  let activeCookie = extractAdobeCookieHeader(sessionCookie) || sessionCookie;
  const hadBrowserArp = hasBrowserAdobeArpSession(activeCookie);
  let arpSessionId = opts.arpSessionId && String(opts.arpSessionId).trim() || resolveAdobeArpSessionId(activeCookie);
  let submitData = {};
  let submitHeaders = new Headers();
  let lastSubmitError = "";
  let sawSystemUnderLoad = false;
  let accessToken = opts.accessToken;
  let authRefreshAttempted = false;
  const {
    withAdobeFireflySubmitGate,
    markAdobeFireflyArpSuccess,
    noteAdobeFireflySubmitFailure,
    rotateAdobeFireflySessionOnError,
    resolveAdobeArpSessionIdSmart,
    fingerprintAdobeCredential,
    estimateAdobeTokenExpiry
  } = await import("./adobeFireflySession.js");
  const fingerprint = String(opts.sessionFingerprint || "").trim() || fingerprintAdobeCredential([accessToken, activeCookie].filter(Boolean).join("\n"));
  const browserSessionKey = String(opts.sessionBrowserKey || "").trim() || fingerprint;
  let videoSubmitOk = false;
  for (let attempt = 1; attempt <= SUBMIT_MAX_ATTEMPTS; attempt++) {
    const submitResp = await withAdobeFireflySubmitGate(
      () => fetchImpl(ADOBE_FIREFLY_VIDEO_SUBMIT_URL, {
        method: "POST",
        headers: buildAdobeSubmitHeaders(accessToken, {
          arpSessionId,
          prompt: opts.prompt,
          cookie: activeCookie || void 0
        }),
        body: JSON.stringify(payload)
      })
    );
    if (submitResp.status === 401 || submitResp.status === 403) {
      noteAdobeFireflySubmitFailure();
      const accessError = submitResp.headers.get("x-access-error") || "";
      if (accessError === "taste_exhausted") {
        throw new AdobeFireflyError(
          "Adobe Firefly quota exhausted for this account",
          429,
          "quota_exhausted"
        );
      }
      if (!authRefreshAttempted && attempt < SUBMIT_MAX_ATTEMPTS) {
        authRefreshAttempted = true;
        const refreshed = await rotateAdobeFireflySessionOnError(
          {
            accessToken,
            cookie: activeCookie,
            arpSessionId,
            tokenExpiresAt: estimateAdobeTokenExpiry(accessToken),
            updatedAt: Date.now(),
            fingerprint,
            browserSessionKey,
            source: "rebuild"
          },
          { attempt, authFailure: true, tryBrowser: true, log: opts.log }
        ).catch(() => null);
        if (refreshed?.accessToken && refreshed?.arpSessionId) {
          accessToken = refreshed.accessToken;
          activeCookie = refreshed.cookie || activeCookie;
          arpSessionId = refreshed.arpSessionId;
          opts.log?.info?.(
            "ADOBE-FIREFLY",
            `video submit auth ${submitResp.status}; retrying once with renewed CDP session`
          );
          continue;
        }
      }
      throw new AdobeFireflyError(
        "Adobe Firefly session is no longer authenticated and automatic browser renewal failed. Sign in once through the Adobe Firefly browser login to restore durable renewal.",
        401,
        "auth"
      );
    }
    if (!submitResp.ok) {
      const text = await submitResp.text().catch(() => "");
      if (isAdobeTransientSubmitError(submitResp.status, text)) {
        sawSystemUnderLoad = true;
      }
      lastSubmitError = `Adobe Firefly video submit failed (${submitResp.status}): ${sanitizeErrorMessage(text.slice(0, 300))}`;
      if (isAdobeTransientSubmitError(submitResp.status, text) && attempt < SUBMIT_MAX_ATTEMPTS) {
        const { getAdobeForterAgeMs: forterAgeMsFn, extractAdobeForterTimestampMs: forterTsFn } = await import("./adobeFireflySession.js");
        const forterTs = forterTsFn(activeCookie || "");
        const forterAgeBefore = forterAgeMsFn(activeCookie || "");
        const forterKnownStale = forterTs > 0 && Number.isFinite(forterAgeBefore) && forterAgeBefore > 4 * 6e4;
        if (forterKnownStale && attempt >= 2) {
          noteAdobeFireflySubmitFailure();
          throw new AdobeFireflyError(
            formatAdobeSystemUnderLoadError("video", attempt, { hadBrowserArp }) + " Risk session looks expired \u2014 open Providers \u2192 Adobe Firefly \u2192 Sign in with browser once.",
            408,
            "system_under_load"
          );
        }
        try {
          if (activeCookie) {
            const rotated = await rotateAdobeFireflySessionOnError(
              {
                accessToken,
                cookie: activeCookie,
                arpSessionId,
                tokenExpiresAt: estimateAdobeTokenExpiry(accessToken),
                updatedAt: Date.now(),
                fingerprint,
                browserSessionKey,
                source: "rebuild"
              },
              {
                attempt,
                tryBrowser: process.env.ADOBE_FIREFLY_BROWSER_REFRESH !== "0",
                log: opts.log
              }
            );
            accessToken = rotated.accessToken || accessToken;
            activeCookie = rotated.cookie || activeCookie;
            arpSessionId = rotated.arpSessionId;
          } else {
            arpSessionId = resolveAdobeArpSessionIdSmart(sessionCookie, {
              rotate: true
            });
          }
        } catch {
        }
        const base = submitBaseDelayMs();
        const delay = base <= 50 ? base : Math.min(9e4, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1500);
        opts.log?.info?.(
          "ADOBE-FIREFLY",
          `video submit transient ${submitResp.status}, retry ${attempt}/${SUBMIT_MAX_ATTEMPTS} in ${delay}ms (recovery attempt=${attempt})`
        );
        await sleep(delay);
        continue;
      }
      noteAdobeFireflySubmitFailure();
      if (sawSystemUnderLoad && isAdobeTransientSubmitError(submitResp.status, text)) {
        throw new AdobeFireflyError(
          formatAdobeSystemUnderLoadError("video", attempt, {
            hadBrowserArp
          }),
          408,
          "system_under_load"
        );
      }
      throw new AdobeFireflyError(
        lastSubmitError,
        submitResp.status >= 400 && submitResp.status < 500 ? submitResp.status : 502
      );
    }
    submitData = await submitResp.json().catch(() => ({}));
    submitHeaders = submitResp.headers;
    markAdobeFireflyArpSuccess(fingerprint, arpSessionId);
    videoSubmitOk = true;
    break;
  }
  if (!videoSubmitOk && !lastSubmitError) {
    throw new AdobeFireflyError(
      formatAdobeSystemUnderLoadError("video", SUBMIT_MAX_ATTEMPTS, { hadBrowserArp }),
      408,
      "system_under_load"
    );
  }
  let pollUrl = extractAdobeResultLink(submitHeaders, submitData);
  if (!pollUrl) {
    if (sawSystemUnderLoad) {
      throw new AdobeFireflyError(
        formatAdobeSystemUnderLoadError("video", SUBMIT_MAX_ATTEMPTS, {
          hadBrowserArp
        }),
        408,
        "system_under_load"
      );
    }
    throw new AdobeFireflyError(
      lastSubmitError || "Adobe Firefly video submit succeeded but no poll URL was returned",
      502
    );
  }
  pollUrl = normalizeAdobePollUrl(pollUrl);
  const { mediaUrl, latest } = await pollAdobeJob({
    pollUrl,
    accessToken,
    kind: "video",
    timeoutMs: opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : DEFAULT_VIDEO_TIMEOUT_MS,
    sessionCookie: activeCookie || sessionCookie || void 0,
    sessionFingerprint: fingerprint,
    fetchImpl,
    log: opts.log
  });
  return { url: mediaUrl, format: "mp4", latest };
}
export {
  ADOBE_FIREFLY_ARKOSE_PUBLIC_KEY,
  ADOBE_FIREFLY_CREDITS_BALANCE_URL,
  ADOBE_FIREFLY_FTR_MAGIC,
  ADOBE_FIREFLY_IMAGE_MODELS,
  ADOBE_FIREFLY_IMAGE_SUBMIT_URL,
  ADOBE_FIREFLY_IMAGE_UPLOAD_URL,
  ADOBE_FIREFLY_IMS_REFRESH_URL,
  ADOBE_FIREFLY_IMS_SCOPE,
  ADOBE_FIREFLY_MAX_UPLOAD_BYTES,
  ADOBE_FIREFLY_MODELS_DISCOVERY_URL,
  ADOBE_FIREFLY_VIDEO_MODELS,
  ADOBE_FIREFLY_VIDEO_SUBMIT_URL,
  AdobeFireflyError,
  adobeFireflyApiKey,
  adobeFireflyBalanceApiKey,
  adobeFireflyExpressClientId,
  adobeFireflyGenerateImage,
  adobeFireflyGenerateVideo,
  buildAdobeArpSessionId,
  buildAdobeBalanceHeaders,
  buildAdobeDiscoveryHeaders,
  buildAdobeImagePayload,
  buildAdobePollHeaders,
  buildAdobeSubmitHeaders,
  buildAdobeSubmitNonce,
  buildAdobeUploadHeaders,
  buildAdobeVideoPayload,
  decodeAdobeJwtPayload2 as decodeAdobeJwtPayload,
  discoverAdobeFireflyModels,
  exchangeAdobeCookieForAccessToken,
  extractAdobeAccountIdFromToken,
  extractAdobeArpSessionId,
  extractAdobeCookieHeader,
  extractAdobeCredentialToken,
  extractAdobeMediaUrl,
  extractAdobeResultLink,
  extractAdobeSourceImageReferences,
  extractAdobeSourceImageSources,
  fetchAdobeCreditsBalance,
  formatAdobeSystemUnderLoadError,
  generateAdobeNonce,
  hasBrowserAdobeArpSession,
  isAdobeGuestAccessToken,
  isAdobeJobFailed,
  isAdobeJobInProgress,
  isAdobeTransientSubmitError,
  isAdobeUserAccessToken,
  isValidAdobeArpSessionId,
  looksLikeAdobeCookieBlob,
  looksLikeAdobeJwt,
  normalizeAdobeAspectRatio,
  normalizeAdobeOutputResolution,
  normalizeAdobePollUrl,
  normalizeAdobeReferenceBlobs,
  parseAdobeCreditsBalance,
  parseAdobeImageSourceBytes,
  parseAdobeModelsDiscovery,
  parseAdobeStorageUploadResponse,
  pollAdobeJob,
  resolveAdobeAccessToken,
  resolveAdobeArpSessionId,
  resolveAdobeImageModel,
  resolveAdobeSourceImageIds,
  resolveAdobeVideoModel,
  uploadAdobeFireflyImage
};
