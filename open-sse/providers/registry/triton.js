export default {
  id: "triton",
  alias: "triton",
  display: {
    name: "NVIDIA Triton",
    icon: "developer_board",
    color: "#76B900",
    textIcon: "TR",
    website: "https://developer.nvidia.com/triton-inference-server",
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  transport: {
    baseUrl: "http://localhost:8000/v1",
    format: "openai",
  },
  passthroughModels: true,
};
