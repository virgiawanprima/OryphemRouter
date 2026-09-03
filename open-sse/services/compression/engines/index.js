import { registerCompressionEngine, getCompressionEngine } from "./registry.js";
import { aggressiveEngine, cavemanEngine, liteEngine, ultraEngine } from "./cavemanAdapter.js";
import { rtkEngine } from "./rtk/index.js";
import { sessionDedupEngine } from "./session-dedup/index.js";
import { headroomEngine } from "./headroom/index.js";
import { ccrEngine } from "./ccr/index.js";
import { llmlinguaEngine } from "./llmlingua/index.js";
import { ionizerEngine } from "./ionizer/index.js";
import { relevanceEngine } from "./relevance/index.js";
import { llmCompressorEngine } from "./llm/index.js";
import { readLifecycleEngine } from "./readLifecycle/index.js";
import { omniglyphEngine } from "./omniglyphAdapter.js";
import { codexResponsesEngine } from "./codexResponses/index.js";
let registered = false;
function registerBuiltinCompressionEngines() {
  if (registered && getCompressionEngine(liteEngine.id)) return;
  registered = true;
  if (!getCompressionEngine(liteEngine.id)) registerCompressionEngine(liteEngine);
  const engines = [
    { id: "caveman", engine: cavemanEngine },
    { id: "aggressive", engine: aggressiveEngine },
    { id: "ultra", engine: ultraEngine },
    { id: "rtk", engine: rtkEngine },
    { id: "codex-responses", engine: codexResponsesEngine },
    { id: "session-dedup", engine: sessionDedupEngine },
    { id: "headroom", engine: headroomEngine },
    { id: "ccr", engine: ccrEngine },
    { id: "llmlingua", engine: llmlinguaEngine },
    { id: "ionizer", engine: ionizerEngine },
    { id: "relevance", engine: relevanceEngine },
    { id: "llm", engine: llmCompressorEngine },
    { id: "read-lifecycle", engine: readLifecycleEngine },
    { id: "omniglyph", engine: omniglyphEngine }
  ];
  for (const { id, engine } of engines) {
    if (!getCompressionEngine(id)) registerCompressionEngine(engine);
  }
}
export {
  registerBuiltinCompressionEngines
};
