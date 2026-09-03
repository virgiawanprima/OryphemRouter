import { getAllToolDefinitions } from "./catalog.js";
import { searchTools } from "./search.js";
import { zodToTsSignature } from "./signature.js";
function handleToolSearch(args) {
  const entries = getAllToolDefinitions().filter((t) => t.name !== "omniroute_tool_search");
  const hits = searchTools(entries, args.query, args.limit ?? 8);
  return {
    query: args.query,
    count: hits.length,
    tools: hits.map((h) => ({
      name: h.name,
      description: h.description,
      scopes: [...h.scopes],
      signature: zodToTsSignature(h.name, h.inputSchema)
    }))
  };
}
export {
  handleToolSearch
};
