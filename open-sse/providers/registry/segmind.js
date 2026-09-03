// Segmind — 200+ hosted image/video models under a single POST /v1/<model> REST call.
// Auth header: x-api-key. Format: segmind. Curated starter subset for image + video.
export default {
  id: "segmind",
  alias: "segmind",
  display: {
    name: "Segmind",
    icon: "image",
    color: "#7C3AED",
    textIcon: "SG",
    website: "https://segmind.com",
    notice: {
      apiKeyUrl: "https://www.segmind.com",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://api.segmind.com/v1",
    format: "segmind",
    executor: "default",
    auth: {
      combined: true,
      header: "x-api-key",
      scheme: "raw",
    },
  },
  models: [
    // Image (from segmind/imageModels.js)
    { id: "flux-schnell", name: "FLUX.1 Schnell", type: "image" },
    { id: "flux-dev", name: "FLUX.1 Dev", type: "image" },
    { id: "flux-1.1-pro", name: "FLUX 1.1 Pro", type: "image" },
    { id: "sdxl1.0-txt2img", name: "Stable Diffusion XL 1.0", type: "image" },
    { id: "sd3.5-large-txt2img", name: "Stable Diffusion 3.5 Large", type: "image" },
    { id: "kandinsky2.2-txt2img", name: "Kandinsky 2.2", type: "image" },
    // Video (from segmind/videoModels.js)
    { id: "wan2.1-t2v", name: "Wan 2.1 Text-to-Video", type: "video" },
    { id: "wan2.7-i2v", name: "Wan 2.7 Image-to-Video", type: "video" },
    { id: "hunyuan-video-t2v", name: "Hunyuan Video Text-to-Video", type: "video" },
    { id: "ltx-video-t2v", name: "LTX Video Text-to-Video", type: "video" },
    { id: "kling-video-t2v", name: "Kling Video Text-to-Video", type: "video" },
  ],
  supportedSizes: ["512x512", "1024x1024", "1024x1792", "1792x1024"],
};
