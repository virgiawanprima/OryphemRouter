export default {
  id: "yolo-auto",
  alias: "yolo-auto",
  display: {
    name: "YOLO Auto",
    icon: "directions_car",
    color: "#16A34A",
    textIcon: "YA",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://yolo-auto.com/v1/chat/completions",
    modelsFetcher: {
      url: "https://yolo-auto.com/v1/models",
      type: "openai",
    },
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "qwen3.6-35b-a3b",
      name: "Qwen 3.6 35B A3B",
    },
  ],
  passthroughModels: true,
};
