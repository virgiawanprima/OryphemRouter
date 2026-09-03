export default {
  id: "friendliai",
  alias: "friendli",
  display: {
    name: "FriendliAI",
    icon: "group",
    color: "#8B5CF6",
    textIcon: "FA",
    website: "https://friendli.ai",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "default",
    baseUrl: "https://api.friendli.ai/serverless/v1/chat/completions",
    modelsFetcher: {
      url: "https://api.friendli.ai/serverless/v1/models",
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
      id: "meta-llama-3.1-70b-instruct",
      name: "meta-llama-3.1-70b-instruct",
    },
    {
      id: "meta-llama-3.1-8b-instruct",
      name: "meta-llama-3.1-8b-instruct",
    },
  ],
};
