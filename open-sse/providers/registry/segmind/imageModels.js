const SEGMIND_IMAGE_MODELS = [
  { id: "flux-schnell", name: "FLUX.1 Schnell" },
  { id: "flux-dev", name: "FLUX.1 Dev" },
  { id: "flux-1.1-pro", name: "FLUX 1.1 Pro" },
  { id: "sdxl1.0-txt2img", name: "Stable Diffusion XL 1.0" },
  { id: "sd3.5-large-txt2img", name: "Stable Diffusion 3.5 Large" },
  { id: "kandinsky2.2-txt2img", name: "Kandinsky 2.2" }
];
const SEGMIND_IMAGE_PROVIDER = {
  id: "segmind",
  baseUrl: "https://api.segmind.com/v1",
  authType: "apikey",
  authHeader: "x-api-key",
  format: "segmind",
  models: SEGMIND_IMAGE_MODELS,
  supportedSizes: ["512x512", "1024x1024", "1024x1792", "1792x1024"]
};
export {
  SEGMIND_IMAGE_MODELS,
  SEGMIND_IMAGE_PROVIDER
};
