export default {
  id: "qianfan",
  priority: 300,
  
  display: {
    name: "qianfan",
    color: "#64748B",
    textIcon: "QI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://qianfan.baidubce.com/v2/chat/completions",
    validateUrl: "https://qianfan.baidubce.com/v2/models",

  },
  
  models: [
  {
    "id": "ernie-5.1",
    "name": "ERNIE 5.1",
    "contextLength": 64000
  },
  {
    "id": "ernie-5.0-thinking-latest",
    "name": "ERNIE 5.0 Thinking Latest",
    "contextLength": 64000
  },
  {
    "id": "ernie-x1.1",
    "name": "ERNIE X1.1",
    "contextLength": 64000
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
