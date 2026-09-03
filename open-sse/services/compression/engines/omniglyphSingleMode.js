import { registerBuiltinCompressionEngines } from "./index.js";
import { getCompressionEngine } from "./registry.js";
async function applyOmniglyphSingleMode(body, options) {
  registerBuiltinCompressionEngines();
  const engine = getCompressionEngine("omniglyph");
  if (!engine?.applyAsync) return { body, compressed: false, stats: null };
  return engine.applyAsync(body, options);
}
export {
  applyOmniglyphSingleMode
};
