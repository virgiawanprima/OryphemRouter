// SAP Generative AI Hub — SAP AI Core deployments. Base URL is the AI_API_URL root
// or a deploymentUrl from Generative AI Hub; chat requests use deploymentUrl/chat/completions
// and require the AI-Resource-Group header. Auth: SAP AI Core bearer token.
export default {
  id: "sap",
  alias: "sap",
  display: {
    name: "SAP Generative AI Hub",
    icon: "business",
    color: "#0FAAFF",
    textIcon: "SAP",
    website: "https://help.sap.com/docs/sap-ai-core/sap-ai-core-service-guide/generative-ai-hub-in-sap-ai-core",
    notice: {
      text: "Use your SAP AI Core bearer token. Base URL can be your AI_API_URL root or a deploymentUrl from Generative AI Hub.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://example-aicore.cfapps.eu10.hana.ondemand.com/v2/lm/deployments/example-deployment/chat/completions",
    validateUrl: "https://example-aicore.cfapps.eu10.hana.ondemand.com/v2/lm/deployments/example-deployment/models",
    format: "openai",
    executor: "default",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [],
  passthroughModels: true,
};
