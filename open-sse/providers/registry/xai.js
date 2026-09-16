export default {
  id: "xai",
  priority: 280,
  alias: "xai",
  display: {
    name: "xAI (Grok)",
    icon: "auto_awesome",
    color: "#1DA1F2",
    textIcon: "XA",
    website: "https://x.ai",
    notice: {
      apiKeyUrl: "https://console.x.ai",
    },
  },
  category: "oauth",
  authModes: [
    "oauth",
    "apikey",
  ],
  hasOAuth: true,
  transport: {
    baseUrl: "https://api.x.ai/v1/chat/completions",
    validateUrl: "https://api.x.ai/v1/models",
    responsesUrl: "https://api.x.ai/v1/responses",
    clientId: "b1a00492-073a-47ea-816f-4c329264a828",
    tokenUrl: "https://auth.x.ai/oauth2/token",
    refreshUrl: "https://auth.x.ai/oauth2/token",
  },
  // Audited against the vendor's own catalog (docs.x.ai/developers/models) 2026-09-16. The
  // list before this audit advertised grok-4 / grok-4-fast-reasoning / grok-code-fast-1 /
  // grok-3 — none of which appear in xAI's current pricing table — while the current flagship
  // (grok-4.6, which the vendor says to use for both code and chat) was missing entirely.
  // The current entries are listed first so the provider default is a live model.
  models: [
    { id: "grok-4.6", name: "Grok 4.6" },
    { id: "grok-4.5", name: "Grok 4.5" },
    { id: "grok-4.3", name: "Grok 4.3" },
    { id: "grok-4.20-0309-reasoning", name: "Grok 4.20 Reasoning (0309)" },
    { id: "grok-4.20-0309-non-reasoning", name: "Grok 4.20 Non-Reasoning (0309)" },
    { id: "grok-4.20-multi-agent-0309", name: "Grok 4.20 Multi-Agent (0309)" },
    { id: "grok-build-0.1", name: "Grok Build 0.1" },
    // Pre-audit entries, kept for now: they are absent from the vendor's pricing table but may
    // still be callable through aliases, and deleting models could break existing configs.
    // Removing them is a `status` decision — the thing ADR-004 proposes storage for.
    { id: "grok-4", name: "Grok 4" },
    { id: "grok-4-fast-reasoning", name: "Grok 4 Fast Reasoning" },
    { id: "grok-code-fast-1", name: "Grok Code Fast 1" },
    { id: "grok-3", name: "Grok 3" },
    { id: "grok-2-image-1212", name: "Grok 2 Image", params: ["n","response_format"], kind: "image" },
    { id: "grok-imagine-video", name: "Grok Imagine Video", params: ["duration","aspect_ratio","resolution"], kind: "video" },
  ],
  serviceKinds: ["llm","imageToText","webSearch","image","video"],
  imageConfig: { baseUrl: "https://api.x.ai/v1/images/generations", bodyFields: ["model","prompt","n","response_format"] },
  // Async video jobs (POST returns { request_id }, GET polls until done/failed).
  // Docs: https://docs.x.ai/developers/rest-api-reference/inference/videos
  videoConfig: { baseUrl: "https://api.x.ai/v1/videos" },
  searchViaChat: {
    // Real xAI id (was the shortened "grok-4.20-reasoning").
    defaultModel: "grok-4.20-0309-reasoning",
    endpoint: "https://api.x.ai/v1/responses",
    pricingUrl: "https://x.ai/api#pricing",
  },
};
