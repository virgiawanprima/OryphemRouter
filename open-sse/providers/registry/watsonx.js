// IBM watsonx.ai Gateway — OpenAI-compatible /chat/completions and /models under /ml/gateway/v1.
// Base: https://<region>.ml.cloud.ibm.com/ml/gateway/v1/ (default region: ca-tor).
// Auth: watsonx bearer token.
export default {
  id: "watsonx",
  alias: "watsonx",
  display: {
    name: "IBM watsonx.ai Gateway",
    icon: "hub",
    color: "#0F62FE",
    textIcon: "WX",
    website: "https://www.ibm.com/products/watsonx-ai",
    notice: {
      text: "Use your watsonx bearer token. Base URL can be https://<region>.ml.cloud.ibm.com/ml/gateway/v1/ or a self-managed /ml/gateway/v1 endpoint.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://ca-tor.ml.cloud.ibm.com/ml/gateway/v1/chat/completions",
    validateUrl: "https://ca-tor.ml.cloud.ibm.com/ml/gateway/v1/models",
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
