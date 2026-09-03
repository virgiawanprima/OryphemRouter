import { BaseExecutor } from "./base.js";
import { makeExecutorErrorResult } from "../utils/errorSanitize.js";
const ADOBE_FIREFLY_BASE_URL = "https://firefly-3p.ff.adobe.io/v2/3p-images/generate-async";
class AdobeFireflyExecutor extends BaseExecutor {
  constructor() {
    super("adobe-firefly", { id: "adobe-firefly", baseUrl: ADOBE_FIREFLY_BASE_URL });
  }
  async execute(_input) {
    return makeExecutorErrorResult(
      400,
      'adobe-firefly is a media-generation provider and does not support chat completions. Use POST /v1/images/generations or /v1/images/edits (e.g. model "adobe-firefly/nano-banana-pro") or POST /v1/videos/generations (e.g. model "adobe-firefly/sora-2").',
      _input.body,
      ADOBE_FIREFLY_BASE_URL
    );
  }
}
var adobe_firefly_default = AdobeFireflyExecutor;
export {
  AdobeFireflyExecutor,
  adobe_firefly_default as default
};
