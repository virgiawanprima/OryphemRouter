const STABILITY_AI_IMAGE_MODELS = [
  { id: "stable-image-ultra", name: "Stable Image Ultra" },
  { id: "stable-image-core", name: "Stable Image Core" },
  { id: "sd3.5-large-turbo", name: "sd3.5-large-turbo" },
  { id: "sd3.5-large", name: "sd3.5-large" },
  { id: "sd3.5-medium", name: "sd3.5-medium" },
  { id: "sd3.5-flash", name: "sd3.5-flash" },
  { id: "erase", name: "Erase", inputModalities: ["image"] },
  { id: "inpaint", name: "Inpaint", inputModalities: ["text", "image"], imageRequired: true },
  { id: "outpaint", name: "Outpaint", inputModalities: ["text", "image"], imageRequired: true },
  { id: "remove-background", name: "Remove Background", inputModalities: ["image"] },
  {
    id: "search-and-replace",
    name: "Search and Replace",
    inputModalities: ["text", "image"],
    imageRequired: true
  },
  {
    id: "search-and-recolor",
    name: "Search and Recolor",
    inputModalities: ["text", "image"],
    imageRequired: true
  },
  {
    id: "replace-background-and-relight",
    name: "Replace Background and Relight",
    inputModalities: ["text", "image"],
    imageRequired: true
  },
  {
    id: "creative",
    name: "Creative Upscale",
    inputModalities: ["text", "image"],
    imageRequired: true
  },
  { id: "fast", name: "Fast Upscale", inputModalities: ["image"] },
  { id: "conservative", name: "Conservative Upscale", inputModalities: ["image"] },
  { id: "sketch", name: "Sketch Control", inputModalities: ["text", "image"], imageRequired: true },
  {
    id: "structure",
    name: "Structure Control",
    inputModalities: ["text", "image"],
    imageRequired: true
  },
  { id: "style", name: "Style Control", inputModalities: ["text", "image"], imageRequired: true },
  {
    id: "style-transfer",
    name: "Style Transfer",
    inputModalities: ["text", "image"],
    imageRequired: true
  }
];
export {
  STABILITY_AI_IMAGE_MODELS
};
