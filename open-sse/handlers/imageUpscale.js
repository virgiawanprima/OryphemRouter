import { getUpscaleProvider, parseUpscaleModel } from "../utils/omni/upscaleRegistry.js";
import { handleAdobeFireflyImageUpscale } from "./imageUpscale/adobeFirefly.js";
import { handleStabilityImageUpscale } from "./imageUpscale/stability.js";
import { handleTopazImageUpscale } from "./imageUpscale/topaz.js";
async function handleImageUpscale({
  body,
  credentials,
  log,
  fetchImpl
}) {
  const requestedModel = typeof body.model === "string" ? body.model : "";
  const { provider, model } = parseUpscaleModel(requestedModel);
  if (!provider || !model) {
    return {
      success: false,
      status: 400,
      error: `Invalid upscale model: ${requestedModel || "(missing)"}. Use format: provider/model (e.g. adobe-firefly/topaz-bloom).`
    };
  }
  const providerConfig = getUpscaleProvider(provider);
  if (!providerConfig) {
    return { success: false, status: 400, error: `Unknown upscale provider: ${provider}` };
  }
  if (!providerConfig.models.some((entry) => entry.id === model)) {
    return {
      success: false,
      status: 400,
      error: `Unsupported upscale model for ${provider}: ${model}. Available: ${providerConfig.models.map((entry) => entry.id).join(", ")}.`
    };
  }
  const resolvedCredentials = credentials ?? {};
  switch (providerConfig.format) {
    case "adobe-firefly-upscale":
      return handleAdobeFireflyImageUpscale({
        model,
        provider,
        body,
        credentials: resolvedCredentials,
        log,
        ...fetchImpl ? { fetchImpl } : {}
      });
    case "stability-upscale":
      return handleStabilityImageUpscale({
        model,
        provider,
        providerConfig,
        body,
        credentials: resolvedCredentials,
        log,
        ...fetchImpl ? { fetchImpl } : {}
      });
    case "topaz-upscale":
      return handleTopazImageUpscale({
        model,
        provider,
        providerConfig,
        body,
        credentials: resolvedCredentials,
        log,
        ...fetchImpl ? { fetchImpl } : {}
      });
    default:
      return {
        success: false,
        status: 400,
        error: `Upscale is not implemented for provider format: ${providerConfig.format}`
      };
  }
}
export {
  handleImageUpscale
};
