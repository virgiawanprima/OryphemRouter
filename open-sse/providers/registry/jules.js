// Google Jules — cloud coding-agent API (jules.googleapis.com/v1alpha).
// OAuth-category cloud agent (task/session management, not chat completions).
// No dedicated executor yet; baseUrl is the documented REST API root.
export default {
  id: "jules",
  alias: "jules",
  display: {
    name: "Google Jules",
    icon: "engineering",
    color: "#4285F4",
    textIcon: "JL",
    website: "https://jules.google",
    notice: {
      text: "Jules API key for creating and managing cloud coding tasks.",
    },
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  authModes: ["oauth"],
  transport: {
    baseUrl: "https://jules.googleapis.com/v1alpha",
    format: "openai",
  },
  models: [],
};
