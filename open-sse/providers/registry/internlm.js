export default {
  id: "internlm",
  priority: 300,
  alias: "internlm",
  
  display: {
    name: "InternLM",
    color: "#10B981",
    textIcon: "IN",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://chat.intern-ai.org.cn/api/v1/chat/completions",
    validateUrl: "https://chat.intern-ai.org.cn/api/v1/models",
    
  },
  
  models: [
  {
    "id": "intern-s1-pro",
    "name": "Intern-S1 Pro"
  },
  {
    "id": "intern-s1",
    "name": "Intern-S1"
  },
  {
    "id": "intern-s1-mini",
    "name": "Intern-S1 Mini"
  },
  {
    "id": "internvl3.5-latest",
    "name": "InternVL3.5 Latest"
  },
  {
    "id": "intern-latest",
    "name": "Intern Latest"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
