import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import {
  DEFAULT_LLMLINGUA_MODEL,
  LLMLINGUA_MODELS
} from "./constants.js";
function getDataDir() {
  return process.env.DATA_DIR || path.join(os.homedir(), ".omniroute");
}
function getLlmlinguaModelCacheDir() {
  const dir = path.join(getDataDir(), "models", "llmlingua");
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
  }
  return dir;
}
function resolveLlmlinguaModel(modelId) {
  if (typeof modelId === "string" && modelId.length > 0 && LLMLINGUA_MODELS[modelId]) {
    return LLMLINGUA_MODELS[modelId];
  }
  return LLMLINGUA_MODELS[DEFAULT_LLMLINGUA_MODEL];
}
function configureTransformersEnv(env, opts) {
  env.cacheDir = getLlmlinguaModelCacheDir();
  if (typeof opts.modelPath === "string" && opts.modelPath.length > 0) {
    env.localModelPath = opts.modelPath;
    env.allowRemoteModels = false;
  } else {
    env.allowRemoteModels = true;
  }
}
export {
  configureTransformersEnv,
  getLlmlinguaModelCacheDir,
  resolveLlmlinguaModel
};
