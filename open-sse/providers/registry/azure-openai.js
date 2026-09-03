// Azure OpenAI (`azure-openai`) — resource endpoint + deployment names as models.
// Uses the dedicated azure-openai executor (open-sse/executors/azure-openai.js) which
// builds /openai/deployments/<model>/chat/completions?api-version=... and sends `api-key`.
// baseUrl is the resource root (e.g. https://my-resource.openai.azure.com).
export default {
  id: "azure-openai",
  alias: "azoi",
  display: {
    name: "Azure OpenAI",
    icon: "cloud",
    color: "#0078D4",
    textIcon: "AZ",
    website: "https://azure.microsoft.com/products/ai-services/openai-service",
    notice: {
      text: "Use your Azure OpenAI API key. Base URL should be your resource endpoint, for example https://my-resource.openai.azure.com.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://example-resource.openai.azure.com",
    format: "openai",
    executor: "azure-openai",
  },
  models: [],
  passthroughModels: true,
};
