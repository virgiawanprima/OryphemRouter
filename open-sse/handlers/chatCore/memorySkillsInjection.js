import { retrieveMemories } from "../../utils/omni/memoryRetrieval.js";
import { getMemorySettings, DEFAULT_MEMORY_SETTINGS, toMemoryRetrievalConfig } from "../../utils/omni/memorySettings.js";
import { injectMemory, shouldInjectMemory } from "../../utils/omni/memoryInjection.js";
import { injectSkills } from "../../utils/omni/skillsInjection.js";
import { buildMemoryToolsForProvider } from "../../utils/omni/memoryBuiltins.js";
import { skillRegistry } from "../../utils/omni/skillsRegistry.js";
import { FORMATS } from "../../translator/formats.js";
import { detectCachingContext } from "../../services/compression/cachingAware.js";
function getSkillsProviderForFormat(format) {
  switch (format) {
    case FORMATS.CLAUDE:
      return "anthropic";
    case FORMATS.GEMINI:
      return "google";
    default:
      return "openai";
  }
}
async function injectMemoryAndSkills({
  body,
  memoryOwnerId,
  provider,
  effectiveModel,
  sourceFormat,
  targetFormat,
  backgroundReason,
  log
}) {
  const memorySettings = memoryOwnerId ? await getMemorySettings().catch(() => DEFAULT_MEMORY_SETTINGS) : null;
  if (memoryOwnerId && memorySettings && shouldInjectMemory(body, {
    enabled: memorySettings.enabled && memorySettings.maxTokens > 0
  })) {
    try {
      const lastUserQuery = (() => {
        const NON_USER_TYPES = /* @__PURE__ */ new Set([
          "function_call",
          "function_call_output",
          "tool_call",
          "tool_call_output",
          "reasoning",
          "computer_call",
          "computer_call_output",
          "web_search_call",
          "file_search_call"
        ]);
        function pickFrom(arr) {
          for (let i = arr.length - 1; i >= 0; i--) {
            const item = arr[i];
            if (!item) continue;
            if (item.role !== void 0 && item.role !== "user") continue;
            if (item.role === void 0 && typeof item.type === "string") {
              if (NON_USER_TYPES.has(item.type)) continue;
            }
            const content = item.content ?? item.text;
            if (typeof content === "string" && content.trim().length > 0) {
              return content;
            }
            if (Array.isArray(content)) {
              const parts = [];
              for (const p of content) {
                if (typeof p === "string") {
                  parts.push(p);
                } else if (p && typeof p === "object") {
                  const pp = p;
                  const ptype = typeof pp.type === "string" ? pp.type : "";
                  if (ptype && ptype !== "text" && ptype !== "input_text" && ptype !== "output_text") {
                    continue;
                  }
                  const t = pp.text ?? pp.input_text;
                  if (typeof t === "string") parts.push(t);
                }
              }
              if (parts.length > 0) return parts.join(" ").trim();
            }
          }
          return "";
        }
        if (Array.isArray(body.messages)) {
          const r = pickFrom(body.messages);
          if (r) return r;
        }
        if (Array.isArray(body.input)) {
          const r = pickFrom(body.input);
          if (r) return r;
        }
        return "";
      })();
      const memories = await retrieveMemories(
        memoryOwnerId,
        toMemoryRetrievalConfig(memorySettings, { query: lastUserQuery })
      );
      if (memories.length > 0) {
        const cacheSafe = detectCachingContext(body, { provider, targetFormat }).hasCacheControl;
        const injected = injectMemory(
          body,
          memories,
          provider,
          { cacheSafe }
        );
        body = injected;
        log?.debug?.("MEMORY", `Injected ${memories.length} memories for key=${memoryOwnerId}`);
      }
    } catch (memErr) {
      log?.debug?.(
        "MEMORY",
        `Memory injection skipped: ${memErr instanceof Error ? memErr.message : String(memErr)}`
      );
    }
  }
  if (memoryOwnerId && memorySettings?.enabled && body.stream !== true) {
    const existingTools = Array.isArray(body.tools) ? body.tools : [];
    const existingToolNames = new Set(
      existingTools.flatMap((tool) => {
        const record = tool;
        if (!record || typeof record !== "object") return [];
        const fn = record.function;
        if (typeof fn?.name === "string") return [fn.name];
        if (typeof record.name === "string") return [record.name];
        return [];
      })
    );
    const memoryTools = buildMemoryToolsForProvider(
      getSkillsProviderForFormat(sourceFormat)
    ).filter((tool) => {
      const record = tool;
      const name = record.function?.name ?? record.name;
      return typeof name === "string" && !existingToolNames.has(name);
    });
    if (memoryTools.length > 0) {
      body = {
        ...body,
        tools: [...existingTools, ...memoryTools]
      };
      log?.debug?.(
        "MEMORY",
        `Injected ${memoryTools.length} memory tool(s) for key=${memoryOwnerId}`
      );
    }
  }
  if (memoryOwnerId && memorySettings?.skillsEnabled) {
    await skillRegistry.loadFromDatabase(memoryOwnerId);
    const existingTools = Array.isArray(body.tools) ? body.tools : [];
    const mergedTools = injectSkills({
      provider: getSkillsProviderForFormat(sourceFormat),
      existingTools,
      apiKeyId: memoryOwnerId,
      model: typeof effectiveModel === "string" ? effectiveModel : void 0,
      sourceFormat,
      targetFormat,
      backgroundReason,
      messages: Array.isArray(body.messages) ? body.messages : Array.isArray(body.input) ? body.input : void 0
    });
    if (mergedTools.length > existingTools.length) {
      body = {
        ...body,
        tools: mergedTools
      };
      log?.debug?.("SKILLS", `Injected ${mergedTools.length - existingTools.length} skills`);
    }
  }
  return { body, memorySettings };
}
export {
  getSkillsProviderForFormat,
  injectMemoryAndSkills
};
