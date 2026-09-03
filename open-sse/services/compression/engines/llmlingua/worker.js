import { Worker } from "node:worker_threads";
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { LLMLINGUA_WORKER_TIMEOUT_MS, LLMLINGUA_WORKER_IDLE_MS } from "./constants.js";
import { resolveLlmlinguaModel } from "./modelStore.js";
import { packMemberInstalled } from "../../../../utils/optionalPacks.js";
const FIRST_CALL_TIMEOUT_MS = 6e4;
const GATE_DEP_REL = path.join("node_modules", "@atjsh", "llmlingua-2", "package.json");
const WORKER_JS_REL = path.join(
  "open-sse",
  "services",
  "compression",
  "engines",
  "llmlingua",
  "onnxWorker.js"
);
const WORKER_TS_REL = path.join(
  "open-sse",
  "services",
  "compression",
  "engines",
  "llmlingua",
  "onnxWorker.ts"
);
const MAX_WALK_UP = 8;
function firstAncestorWith(anchors, relPath) {
  for (const anchor of anchors) {
    if (!anchor) continue;
    let dir = path.resolve(anchor);
    for (let i = 0; i <= MAX_WALK_UP; i++) {
      if (fs.existsSync(path.join(dir, relPath))) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return null;
}
function runtimeAnchors() {
  const anchors = [process.cwd()];
  const argv1 = process.argv[1];
  if (typeof argv1 === "string" && argv1) anchors.push(path.dirname(argv1));
  return anchors;
}
let _depsAvailable = null;
function depsAvailable() {
  if (_depsAvailable !== null) return _depsAvailable;
  _depsAvailable = firstAncestorWith(runtimeAnchors(), GATE_DEP_REL) !== null || packMemberInstalled(GATE_DEP_REL);
  return _depsAvailable;
}
let worker = null;
let nextId = 1;
const pending = /* @__PURE__ */ new Map();
const queue = [];
let busy = false;
const warmedModels = /* @__PURE__ */ new Set();
let idleTimer = null;
function resolveWorkerFile() {
  const anchors = runtimeAnchors();
  const jsRoot = firstAncestorWith(anchors, WORKER_JS_REL);
  if (jsRoot) return { workerFile: path.join(jsRoot, WORKER_JS_REL), execArgv: [] };
  const tsRoot = firstAncestorWith(anchors, WORKER_TS_REL);
  if (tsRoot)
    return { workerFile: path.join(tsRoot, WORKER_TS_REL), execArgv: ["--import", "tsx/esm"] };
  return { workerFile: path.join(process.cwd(), WORKER_JS_REL), execArgv: [] };
}
function bumpIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    resetWorker();
  }, LLMLINGUA_WORKER_IDLE_MS);
  if (typeof idleTimer.unref === "function") idleTimer.unref();
}
function resetWorker() {
  const w = worker;
  worker = null;
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  for (const [, entry] of pending) {
    clearTimeout(entry.timer);
    entry.resolve(entry.originalText);
  }
  pending.clear();
  busy = false;
  warmedModels.clear();
  if (w) {
    try {
      void w.terminate();
    } catch {
    }
  }
}
function ensureWorker() {
  if (worker) return worker;
  const { workerFile, execArgv } = resolveWorkerFile();
  const absoluteWorkerFile = path.resolve(workerFile);
  const w = new Worker(pathToFileURL(absoluteWorkerFile).href, { execArgv });
  w.on("message", (reply) => {
    const entry = pending.get(reply.id);
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(reply.id);
      if (reply.ok) warmedModels.add(entry.modelKey);
      entry.resolve(reply.text);
    }
    busy = false;
    pump();
  });
  const failOpenAndRespawn = () => {
    failAllPending();
    if (worker === w) worker = null;
    busy = false;
  };
  w.on("error", failOpenAndRespawn);
  w.on("exit", failOpenAndRespawn);
  worker = w;
  return w;
}
function failAllPending() {
  for (const [id, entry] of pending) {
    clearTimeout(entry.timer);
    pending.delete(id);
    entry.resolve(entry.originalText);
  }
}
function pump() {
  if (busy) return;
  const item = queue.shift();
  if (!item) return;
  busy = true;
  bumpIdleTimer();
  let w;
  try {
    w = ensureWorker();
  } catch {
    busy = false;
    item.resolve(item.text);
    pump();
    return;
  }
  const id = nextId++;
  const modelKey = resolveLlmlinguaModel(item.opts?.model).id;
  const warm = warmedModels.has(modelKey);
  const timeoutMs = warm ? LLMLINGUA_WORKER_TIMEOUT_MS : FIRST_CALL_TIMEOUT_MS;
  const timer = setTimeout(() => {
    const entry = pending.get(id);
    if (entry) {
      pending.delete(id);
      entry.resolve(item.text);
    }
    busy = false;
    pump();
  }, timeoutMs);
  if (typeof timer.unref === "function") timer.unref();
  pending.set(id, {
    // Warming is decided by the reply handler (success only) — not here, so a
    // timeout/error fail-open never marks the model warm.
    resolve: item.resolve,
    timer,
    originalText: item.text,
    modelKey
  });
  try {
    w.postMessage({
      id,
      text: item.text,
      model: item.opts?.model,
      compressionRate: item.opts?.compressionRate,
      modelPath: item.opts?.modelPath
    });
  } catch {
    clearTimeout(timer);
    pending.delete(id);
    item.resolve(item.text);
    if (worker === w) worker = null;
    busy = false;
    pump();
  }
}
const workerBackend = async (text, opts) => {
  if (!depsAvailable()) {
    return text;
  }
  return new Promise((resolve) => {
    queue.push({ text, opts, resolve });
    pump();
  });
};
function __resetLlmlinguaWorkerForTests() {
  while (queue.length) {
    const item = queue.shift();
    item.resolve(item.text);
  }
  resetWorker();
  _depsAvailable = null;
  nextId = 1;
}
export {
  __resetLlmlinguaWorkerForTests,
  depsAvailable,
  firstAncestorWith,
  resolveWorkerFile,
  workerBackend
};
