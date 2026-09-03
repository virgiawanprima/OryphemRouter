import { getExecutor } from "../../../executors/index.js";
function createExecutorModelClient(provider, credentials, costPerKTokenOut) {
  const executor = getExecutor(provider);
  return {
    async complete(model, messages) {
      const body = { model, messages, stream: false };
      const input = {
        model,
        body,
        stream: false,
        credentials
      };
      const raw = await executor.execute(input);
      const response = raw.response;
      const json = await response.json();
      const text = json.choices?.[0]?.message?.content ?? "";
      const outTokens = json.usage?.completion_tokens ?? 0;
      const usdCost = typeof costPerKTokenOut === "number" ? outTokens / 1e3 * costPerKTokenOut : void 0;
      return usdCost === void 0 ? { text } : { text, usdCost };
    }
  };
}
export {
  createExecutorModelClient
};
