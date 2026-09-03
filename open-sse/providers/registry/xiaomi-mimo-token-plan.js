export default {
  id: "xiaomi-mimo-token-plan",
  priority: 300,
  alias: "mimotp",
  
  display: {
    name: "xiaomi-mimo-token-plan",
    color: "#64748B",
    textIcon: "XI",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1",
    
  },
  
  models: [],
  features: {
    usage: true,
    usageApikey: true,
  },
};
