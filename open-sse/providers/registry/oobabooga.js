export default {
  id: "oobabooga",
  alias: "ooba",
  display: {
    name: "oobabooga",
    icon: "dns",
    color: "#8B5CF6",
    textIcon: "OO",
    website: "https://github.com/oobabooga/text-generation-webui",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:5000/v1",
    format: "openai",
  },
  passthroughModels: true,
};
