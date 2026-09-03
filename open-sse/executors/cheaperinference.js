import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "./executorConstants.js";
import { getModelTargetFormat, PROVIDER_ID_TO_ALIAS } from "../config/providerModels.js";
class CheaperInferenceExecutor extends BaseExecutor {
  constructor(provider = "cheaperinference") {
    super(provider, PROVIDERS[provider]);
  }
  /**
   * True when this model is served by the native /v1/responses endpoint.
   *
   * PROVIDER_MODELS is keyed by provider ALIAS ("cinf"), while PROVIDERS is keyed by
   * provider ID ("cheaperinference") — so `this.provider` cannot be passed straight
   * through the way executors/xai.ts does (there the alias equals the id, which hides
   * the distinction). Resolve the alias first or every lookup silently returns null
   * and every Responses request 400s upstream.
   */
  usesResponsesEndpoint(model) {
    const alias = PROVIDER_ID_TO_ALIAS[this.provider] || this.provider;
    return getModelTargetFormat(alias, model) === "openai-responses";
  }
  buildUrl(model, _stream, _urlIndex = 0) {
    if (this.usesResponsesEndpoint(model)) {
      return this.config.responsesBaseUrl || this.config.baseUrl;
    }
    return this.config.baseUrl;
  }
  transformRequest(model, body, stream, credentials) {
    const cleanedBody = super.transformRequest(model, body, stream, credentials);
    if (!cleanedBody || typeof cleanedBody !== "object" || Array.isArray(cleanedBody)) {
      return cleanedBody;
    }
    if (!this.usesResponsesEndpoint(model)) {
      return cleanedBody;
    }
    return { ...cleanedBody, store: false };
  }
}
var cheaperinference_default = CheaperInferenceExecutor;
export {
  CheaperInferenceExecutor,
  cheaperinference_default as default
};
