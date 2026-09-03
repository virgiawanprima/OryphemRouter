import { getDynamicImageModels } from "../../../config/dynamicImageModelSources.js";
const AI_HORDE_IMAGE_PROVIDER = {
  id: "aihorde",
  alias: "horde",
  baseUrl: "https://aihorde.net/api",
  authType: "apikey",
  authHeader: "apikey",
  format: "aihorde",
  get models() {
    return getDynamicImageModels("aihorde");
  },
  supportedSizes: ["512x512", "768x768", "1024x1024", "1024x768", "768x1024"]
};
export {
  AI_HORDE_IMAGE_PROVIDER
};
