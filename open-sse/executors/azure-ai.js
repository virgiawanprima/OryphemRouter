import { DefaultExecutor } from "./default.js";
import { applyAzureParamRules } from "./azureParamRules.js";
class AzureAiExecutor extends DefaultExecutor {
  constructor() {
    super("azure-ai");
  }
  transformRequest(model, body, stream, credentials) {
    return applyAzureParamRules(
      model,
      body,
      super.transformRequest(model, body, stream, credentials)
    );
  }
}
export {
  AzureAiExecutor
};
