export default {
  id: "llamafile",
  alias: "llamafile",
  display: {
    name: "Llamafile",
    icon: "article",
    color: "#EA580C",
    textIcon: "LF",
    website: "https://github.com/Mozilla-Ocho/llamafile",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://127.0.0.1:8080/v1",
    format: "openai",
  },
  passthroughModels: true,
};
