// Azure AI Foundry (`azure-ai`) — OpenAI v1 surface with deployment names as models.
// Uses the dedicated azure-ai executor (open-sse/executors/azure-ai.js) which applies
// Azure param rules; URL building/auth handled by the DefaultExecutor keyed on azure-ai.
export default {
  id: "azure-ai",
  alias: "azai",
  display: {
    name: "Azure AI Foundry",
    icon: "cloud",
    color: "#2563EB",
    textIcon: "AF",
    website: "https://learn.microsoft.com/azure/ai-foundry",
    notice: {
      text: "Use your Azure AI Foundry key. Base URL can be https://<resource>.services.ai.azure.com/openai/v1/ or https://<resource>.openai.azure.com/openai/v1/.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://example-resource.services.ai.azure.com/openai/v1",
    format: "openai",
    executor: "azure-ai",
  },
  models: [],
  passthroughModels: true,
};
