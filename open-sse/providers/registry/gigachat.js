export default {
  id: "gigachat",
  alias: "gigachat",
  display: {
    name: "GigaChat",
    icon: "bolt",
    color: "#006BFF",
    textIcon: "GC",
    website: "https://developers.sber.ru/gigachat",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://gigachat.devices.sberbank.ru/api/v1",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  models: [
    {
      id: "GigaChat-2-Max",
      name: "GigaChat-2-Max",
    },
    {
      id: "GigaChat-2-Pro",
      name: "GigaChat-2-Pro",
    },
    {
      id: "GigaChat-2-Lite",
      name: "GigaChat-2-Lite",
    },
  ],
};
