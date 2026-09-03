import { BaseExecutor } from "./base.js";
import { makeExecutorErrorResult } from "../utils/errorSanitize.js";
const DESIGNER_WEB_BASE_URL = "https://designerapp.officeapps.live.com/designerapp/DallE.ashx?action=GetDallEImagesCogSci";
class MicrosoftDesignerWebExecutor extends BaseExecutor {
  constructor() {
    super("microsoft-designer-web", { id: "microsoft-designer-web", baseUrl: DESIGNER_WEB_BASE_URL });
  }
  async execute(_input) {
    return makeExecutorErrorResult(
      400,
      'microsoft-designer-web is an image-generation-only provider and does not support chat completions. Use POST /v1/images/generations with model "microsoft-designer-web/dall-e-3" instead.',
      _input.body,
      DESIGNER_WEB_BASE_URL
    );
  }
}
var microsoft_designer_web_default = MicrosoftDesignerWebExecutor;
export {
  MicrosoftDesignerWebExecutor,
  microsoft_designer_web_default as default
};
