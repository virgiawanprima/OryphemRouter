import { MCP_TOOLS } from "../schemas/tools.js";
import { memoryTools } from "../tools/memoryTools.js";
import { skillTools } from "../tools/skillTools.js";
import { agentSkillTools } from "../tools/agentSkillTools.js";
import { githubSkillTools } from "../tools/githubSkillTools.js";
import { poolTools } from "../tools/poolTools.js";
import { gamificationTools } from "../tools/gamificationTools.js";
import { pluginTools } from "../tools/pluginTools.js";
import { notionTools } from "../tools/notionTools.js";
import { obsidianTools } from "../tools/obsidianTools.js";
import { localCorpusTools } from "../tools/localCorpusTools.js";
import { compressionTools } from "../tools/compressionTools.js";
function normalizeEntry(raw) {
  const name = typeof raw.name === "string" ? raw.name : null;
  const description = typeof raw.description === "string" ? raw.description : "";
  if (!name) return null;
  const scopes = Array.isArray(raw.scopes) ? raw.scopes.filter((s) => typeof s === "string") : [];
  return { name, description, scopes, inputSchema: raw.inputSchema };
}
function collectFromArray(arr) {
  const result = [];
  for (const item of arr) {
    const entry = normalizeEntry(item);
    if (entry) result.push(entry);
  }
  return result;
}
function collectFromRecord(rec) {
  return collectFromArray(Object.values(rec));
}
function collectAny(collection) {
  if (Array.isArray(collection)) return collectFromArray(collection);
  if (collection && typeof collection === "object") {
    return collectFromRecord(collection);
  }
  return [];
}
function getAllToolDefinitions() {
  const collections = [
    MCP_TOOLS,
    memoryTools,
    skillTools,
    agentSkillTools,
    githubSkillTools,
    poolTools,
    gamificationTools,
    pluginTools,
    notionTools,
    obsidianTools,
    localCorpusTools,
    // Keep the concrete handler collection in the catalog as a parity guard. Canonical CCR
    // definitions now live in MCP_TOOLS too; deduplication below keeps each name visible once.
    compressionTools
  ];
  const seen = /* @__PURE__ */ new Set();
  const result = [];
  for (const collection of collections) {
    for (const entry of collectAny(collection)) {
      if (!seen.has(entry.name)) {
        seen.add(entry.name);
        result.push(entry);
      }
    }
  }
  return result;
}
export {
  getAllToolDefinitions
};
