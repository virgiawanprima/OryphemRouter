export default {
  id: "stepfun",
  priority: 300,
  alias: "stepfun",
  
  display: {
    name: "stepfun",
    color: "#64748B",
    textIcon: "ST",
  },
  category: "apikey",
  transport: {
    baseUrl: "https://api.stepfun.com/v1/chat/completions",
    validateUrl: "https://api.stepfun.com/v1/models",
    
  },
  
  models: [
  {
    "id": "step-3.7-flash",
    "name": "Step 3.7 Flash",
    "contextLength": 262144
  },
  {
    "id": "step-3.5-flash",
    "name": "Step 3.5 Flash",
    "contextLength": 262144
  },
  {
    "id": "step-3.5-flash-2603",
    "name": "Step 3.5 Flash 2603",
    "contextLength": 262144
  },
  {
    "id": "step-1o-turbo-vision",
    "name": "Step 1o Turbo Vision",
    "contextLength": 32768
  },
  {
    "id": "step-1v",
    "name": "Step 1V"
  }
],
  features: {
    usage: true,
    usageApikey: true,
  },
};
