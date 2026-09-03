// OCI Generative AI — OpenAI-compatible chat + responses (region-scoped).
// Default region: us-chicago-1. Auth: API key or IAM bearer token.
export default {
  id: "oci",
  alias: "oci",
  display: {
    name: "OCI Generative AI",
    icon: "cloud",
    color: "#C74634",
    textIcon: "OCI",
    website: "https://www.oracle.com/artificial-intelligence/generative-ai",
    notice: {
      text: "Use your OCI Generative AI API key or IAM bearer token. Base URL can be https://inference.generativeai.<region>.oci.oraclecloud.com/openai/v1/.",
    },
  },
  category: "apikey",
  authType: "apikey",
  authModes: ["apikey"],
  transport: {
    baseUrl: "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1/chat/completions",
    validateUrl: "https://inference.generativeai.us-chicago-1.oci.oraclecloud.com/openai/v1/models",
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
