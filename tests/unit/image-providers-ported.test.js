import { describe, it, expect } from "vitest";
import { getImageAdapter, isImageProvider } from "open-sse/handlers/imageProviders/index.js";

const NEW_ADAPTERS = [
  "adobe-firefly", "aihorde", "alibaba", "chatgpt-web", "cursor",
  "microsoft-designer-web", "haiper", "hyperbolic", "ideogram", "imagen3",
  "leonardo", "magnific", "nvidia", "segmind",
];

describe("ported image provider adapters (OmniRoute)", () => {
  it("registers all 14 new providers", () => {
    for (const id of NEW_ADAPTERS) {
      expect(isImageProvider(id), `${id} registered`).toBe(true);
      expect(getImageAdapter(id), `${id} adapter`).toBeTruthy();
    }
  });

  it("each adapter exposes a usable interface (build* + normalize, or executor path)", () => {
    for (const id of NEW_ADAPTERS) {
      const a = getImageAdapter(id);
      const executorPath = a.useExecutor === true && typeof a.executeViaExecutor === "function";
      const manualPath =
        typeof a.buildUrl === "function" &&
        typeof a.buildHeaders === "function" &&
        typeof a.buildBody === "function" &&
        (typeof a.normalize === "function" || typeof a.parseResponse === "function");
      expect(executorPath || manualPath, `${id} interface`).toBe(true);
    }
  });

  it("does not break existing adapters", () => {
    for (const id of ["openai", "gemini", "codex", "sdwebui", "comfyui", "fal-ai", "stability-ai", "black-forest-labs", "runwayml", "cloudflare-ai", "antigravity"]) {
      expect(isImageProvider(id), `${id} still registered`).toBe(true);
    }
  });
});
