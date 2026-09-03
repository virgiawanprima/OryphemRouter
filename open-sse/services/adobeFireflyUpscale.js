import {
  AdobeFireflyError,
  buildAdobeArpSessionId,
  buildAdobeSubmitHeaders,
  extractAdobeArpSessionId,
  extractAdobeCookieHeader,
  extractAdobeResultLink,
  formatAdobeSystemUnderLoadError,
  isAdobeTransientSubmitError,
  normalizeAdobePollUrl,
  pollAdobeJob
} from "./adobeFireflyClient.js";
import { sanitizeErrorMessage } from "../utils/errorSanitize.js";
const ADOBE_FIREFLY_IMAGE_UPSAMPLE_URL = "https://firefly-3p.ff.adobe.io/v2/3p-images/upsample";
const ADOBE_FIREFLY_UPSCALE_TIMEOUT_MS = 3e5;
const SUBMIT_MAX_ATTEMPTS = 5;
const ADOBE_FIREFLY_MAX_CREATIVITY_LEVEL = 1;
const ADOBE_FIREFLY_UPSCALE_MODELS = {
  // Bare `topaz` maps to the standard version rather than the discovery-listed
  // "default" alias: both resolve to bksGenerationModel firefly_3p:external:topaz_standard,
  // and pinning the explicit version avoids depending on an alias we have not captured.
  topaz: {
    upstreamModelId: "topaz",
    upstreamModelVersion: "standard",
    factors: [2, 4],
    supportsCreativity: false
  },
  "topaz-standard": {
    upstreamModelId: "topaz",
    upstreamModelVersion: "standard",
    factors: [2, 4],
    supportsCreativity: false
  },
  "topaz-bloom": {
    upstreamModelId: "topaz",
    upstreamModelVersion: "reimagine",
    factors: [2, 4],
    supportsCreativity: true
  }
};
function resolveAdobeUpscaleModel(model) {
  const raw = String(model || "").trim().toLowerCase().replace(/^adobe-firefly\//, "").replace(/^firefly\//, "");
  if (!raw) return null;
  if (raw in ADOBE_FIREFLY_UPSCALE_MODELS) {
    const id = raw;
    return { id, spec: ADOBE_FIREFLY_UPSCALE_MODELS[id] };
  }
  if (raw.includes("bloom") || raw.includes("reimagine")) {
    return { id: "topaz-bloom", spec: ADOBE_FIREFLY_UPSCALE_MODELS["topaz-bloom"] };
  }
  if (raw.includes("topaz")) {
    return { id: "topaz-standard", spec: ADOBE_FIREFLY_UPSCALE_MODELS["topaz-standard"] };
  }
  return null;
}
function isAdobeFireflyUpscaleModel(model) {
  return resolveAdobeUpscaleModel(model) !== null;
}
function resolveAdobeCreativityLevel(opts) {
  const explicit = opts.creativityLevel;
  if (typeof explicit === "number" && Number.isFinite(explicit)) {
    return clampLevel(normalizeExplicitCreativity(explicit));
  }
  if (typeof explicit === "string" && explicit.trim() && Number.isFinite(Number(explicit))) {
    return clampLevel(normalizeExplicitCreativity(Number(explicit)));
  }
  const percent = typeof opts.creativityPercent === "number" && Number.isFinite(opts.creativityPercent) ? Math.max(0, Math.min(100, opts.creativityPercent)) : 0;
  return clampLevel(percent / 100);
}
function normalizeExplicitCreativity(value) {
  if (value > ADOBE_FIREFLY_MAX_CREATIVITY_LEVEL && value <= 5) {
    return value / 5;
  }
  return value;
}
function clampLevel(value) {
  if (!Number.isFinite(value)) return 0;
  const clamped = Math.max(0, Math.min(ADOBE_FIREFLY_MAX_CREATIVITY_LEVEL, value));
  return Math.round(clamped * 100) / 100;
}
function buildAdobeUpsampleHeaders(accessToken, extras) {
  const headers = buildAdobeSubmitHeaders(accessToken, {
    arpSessionId: extras?.arpSessionId,
    cookie: extras?.cookie,
    prompt: "upsample"
  });
  delete headers["x-nonce"];
  return headers;
}
function buildAdobeUpsamplePayload(opts) {
  const payload = {
    modelId: opts.modelSpec.upstreamModelId,
    modelVersion: opts.modelSpec.upstreamModelVersion,
    generationMetadata: {
      module: "image-editing",
      submodule: "ff-image-editor",
      sourceDocumentId: null,
      originalPrompt: null,
      filterString: null,
      subPrompts: null,
      canvasImageReference: null
    },
    referenceBlobs: [{ id: String(opts.blobId), usage: "general" }],
    upsamplerFactor: opts.upsamplerFactor
  };
  if (opts.modelSpec.supportsCreativity) {
    payload.creativityLevel = Number.isFinite(opts.creativityLevel) ? opts.creativityLevel : 0;
  }
  return payload;
}
async function adobeFireflyUpscaleImage(opts) {
  const fetchImpl = opts.fetchImpl || fetch;
  const resolved = resolveAdobeUpscaleModel(opts.model);
  if (!resolved) {
    throw new AdobeFireflyError(
      `Unsupported Adobe Firefly upscale model: ${opts.model}. Use topaz-standard or topaz-bloom.`,
      400,
      "bad_model"
    );
  }
  const { spec } = resolved;
  const blobId = String(opts.blobId || "").trim();
  if (!blobId) {
    throw new AdobeFireflyError("Adobe Firefly upscale requires a source image", 400, "bad_image");
  }
  const factor = normalizeFactor(opts.upsamplerFactor, spec.factors);
  const creativityLevel = spec.supportsCreativity ? resolveAdobeCreativityLevel({
    creativityPercent: opts.creativityPercent ?? null,
    creativityLevel: opts.creativityLevel
  }) : 0;
  const payload = buildAdobeUpsamplePayload({
    modelSpec: spec,
    blobId,
    upsamplerFactor: factor,
    creativityLevel
  });
  const sessionCookie = String(opts.sessionCookie || "").trim();
  const cookieHeader = extractAdobeCookieHeader(sessionCookie);
  const browserArp = extractAdobeArpSessionId(cookieHeader || sessionCookie);
  const hadBrowserArp = Boolean(browserArp);
  let arpSessionId = opts.arpSessionId && String(opts.arpSessionId).trim() || browserArp || buildAdobeArpSessionId();
  const accessToken = opts.accessToken;
  let submitData = {};
  let submitHeaders = new Headers();
  let lastSubmitError = "";
  let sawSystemUnderLoad = false;
  let submitted = false;
  for (let attempt = 1; attempt <= SUBMIT_MAX_ATTEMPTS; attempt++) {
    const submitResp = await fetchImpl(ADOBE_FIREFLY_IMAGE_UPSAMPLE_URL, {
      method: "POST",
      headers: buildAdobeUpsampleHeaders(accessToken, {
        arpSessionId,
        cookie: cookieHeader || void 0
      }),
      body: JSON.stringify(payload)
    });
    if (submitResp.status === 401 || submitResp.status === 403) {
      if ((submitResp.headers.get("x-access-error") || "") === "taste_exhausted") {
        throw new AdobeFireflyError(
          "Adobe Firefly quota exhausted for this account",
          429,
          "quota_exhausted"
        );
      }
      throw new AdobeFireflyError(
        "Adobe Firefly token invalid or expired. Paste a fresh IMS JWT (Authorization: Bearer on firefly-3p) plus the firefly.adobe.com Cookie once.",
        401,
        "auth"
      );
    }
    if (!submitResp.ok) {
      const text = await submitResp.text().catch(() => "");
      if (isAdobeTransientSubmitError(submitResp.status, text)) sawSystemUnderLoad = true;
      lastSubmitError = `Adobe Firefly image upscale submit failed (${submitResp.status}): ` + sanitizeErrorMessage(text.slice(0, 300));
      if (isAdobeTransientSubmitError(submitResp.status, text) && attempt < SUBMIT_MAX_ATTEMPTS) {
        if (!hadBrowserArp) {
          arpSessionId = buildAdobeArpSessionId();
        }
        const delay = submitRetryDelayMs(attempt);
        opts.log?.info?.(
          "ADOBE-FIREFLY",
          `upscale submit transient ${submitResp.status}, retry ${attempt}/${SUBMIT_MAX_ATTEMPTS} in ${delay}ms`
        );
        await sleep(delay);
        continue;
      }
      if (sawSystemUnderLoad && isAdobeTransientSubmitError(submitResp.status, text)) {
        throw new AdobeFireflyError(
          formatAdobeSystemUnderLoadError("image", attempt),
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
    submitted = true;
    break;
  }
  if (!submitted) {
    throw new AdobeFireflyError(
      lastSubmitError || "Adobe Firefly upscale submit failed after retries",
      502
    );
  }
  let pollUrl = extractAdobeResultLink(submitHeaders, submitData);
  if (!pollUrl) {
    if (sawSystemUnderLoad) {
      throw new AdobeFireflyError(
        formatAdobeSystemUnderLoadError("image", SUBMIT_MAX_ATTEMPTS),
        408,
        "system_under_load"
      );
    }
    throw new AdobeFireflyError(
      lastSubmitError || "Adobe Firefly upscale submit succeeded but no poll URL was returned",
      502
    );
  }
  pollUrl = normalizeAdobePollUrl(pollUrl);
  const { mediaUrl, latest } = await pollAdobeJob({
    pollUrl,
    accessToken,
    kind: "image",
    timeoutMs: opts.timeoutMs && opts.timeoutMs > 0 ? opts.timeoutMs : ADOBE_FIREFLY_UPSCALE_TIMEOUT_MS,
    fetchImpl,
    log: opts.log
  });
  return { url: mediaUrl, latest, factor, creativityLevel };
}
function normalizeFactor(value, allowed) {
  const factors = allowed.length > 0 ? [...allowed] : [2, 4];
  let n = typeof value === "number" ? value : Number(String(value ?? "").replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n) || n <= 0) n = 2;
  let best = factors[0];
  let bestDelta = Math.abs(best - n);
  for (const f of factors) {
    const delta = Math.abs(f - n);
    if (delta < bestDelta) {
      best = f;
      bestDelta = delta;
    }
  }
  return best;
}
function submitRetryDelayMs(attempt) {
  const raw = process.env.ADOBE_FIREFLY_SUBMIT_BASE_DELAY_MS;
  const base = raw != null && raw !== "" ? Math.max(0, Number(raw) || 0) : process.env.NODE_ENV === "test" || process.env.VITEST || process.env.NODE_TEST_CONTEXT ? 20 : 8e3;
  if (base <= 50) return base;
  return Math.min(9e4, base * Math.pow(2, attempt - 1)) + Math.floor(Math.random() * 1500);
}
async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
export {
  ADOBE_FIREFLY_IMAGE_UPSAMPLE_URL,
  ADOBE_FIREFLY_MAX_CREATIVITY_LEVEL,
  ADOBE_FIREFLY_UPSCALE_MODELS,
  ADOBE_FIREFLY_UPSCALE_TIMEOUT_MS,
  adobeFireflyUpscaleImage,
  buildAdobeUpsampleHeaders,
  buildAdobeUpsamplePayload,
  isAdobeFireflyUpscaleModel,
  resolveAdobeCreativityLevel,
  resolveAdobeUpscaleModel
};
