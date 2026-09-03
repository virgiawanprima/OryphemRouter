const OPENAI_SIZE_TO_ASPECT_RATIO = {
  "256x256": "1:1",
  "512x512": "1:1",
  "1024x1024": "1:1",
  "1792x1024": "16:9",
  "1024x1792": "9:16",
  "1536x1024": "3:2",
  "1024x1536": "2:3"
};
const ASPECT_RATIO_PASSTHROUGH = /^\d+:\d+$/;
function mapImageSize(sizeParam) {
  if (!sizeParam) return "1:1";
  if (ASPECT_RATIO_PASSTHROUGH.test(sizeParam)) return sizeParam;
  return OPENAI_SIZE_TO_ASPECT_RATIO[sizeParam] ?? "1:1";
}
export {
  mapImageSize
};
