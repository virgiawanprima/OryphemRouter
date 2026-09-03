const CHEAPERINFERENCE_IMAGE_PROVIDER = {
  id: "cheaperinference",
  alias: "cinf",
  baseUrl: "https://api.cheaperinference.com/v1/images/generations",
  authType: "apikey",
  authHeader: "bearer",
  format: "openai",
  models: [
    { id: "grok-imagine", name: "Grok Imagine (Cheaper Inference)" },
    { id: "nano-banana-pro", name: "Nano Banana Pro (Cheaper Inference)" },
    { id: "nano-banana-2", name: "Nano Banana 2 (Cheaper Inference)" }
  ],
  supportedSizes: ["1024x1024", "2048x2048", "4096x4096"]
};
export {
  CHEAPERINFERENCE_IMAGE_PROVIDER
};
