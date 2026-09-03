import { workerBackend, depsAvailable } from "./worker.js";
import { DEFAULT_LLMLINGUA_MODEL } from "./constants.js";
let _slmAvailable = null;
let _testHooks = null;
function __setUltraSlmTestHooks(hooks) {
  _testHooks = hooks;
}
function slmAvailable() {
  if (_testHooks && typeof _testHooks.available === "boolean") return _testHooks.available;
  if (_slmAvailable !== null) return _slmAvailable;
  _slmAvailable = depsAvailable();
  return _slmAvailable;
}
async function runLlmlinguaUltra(text, opts) {
  if (_testHooks?.run) {
    const out2 = await _testHooks.run(text, opts);
    if (typeof out2 !== "string" || out2.length >= text.length) {
      throw new Error("llmlingua-ultra: backend produced no gain");
    }
    return out2;
  }
  const out = await workerBackend(text, {
    model: opts?.model,
    compressionRate: opts?.compressionRate,
    modelPath: opts?.modelPath
  });
  if (typeof out !== "string" || out.length >= text.length) {
    throw new Error("llmlingua-ultra: backend produced no gain");
  }
  return out;
}
async function prewarmLlmlinguaUltra(opts) {
  if (!slmAvailable()) return false;
  try {
    await runLlmlinguaUltra(
      "The quick brown fox jumps over the lazy dog while the sun sets behind the hills.",
      { model: opts?.model ?? DEFAULT_LLMLINGUA_MODEL, compressionRate: opts?.compressionRate }
    );
  } catch {
  }
  return true;
}
function __resetUltraEntryForTests() {
  _slmAvailable = null;
  _testHooks = null;
}
export {
  __resetUltraEntryForTests,
  __setUltraSlmTestHooks,
  prewarmLlmlinguaUltra,
  runLlmlinguaUltra,
  slmAvailable
};
