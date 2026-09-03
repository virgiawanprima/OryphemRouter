import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}
function workerUrl() {
  const dir = dirname(fileURLToPath(import.meta.url));
  for (const name of ["compressionWorker.js", "compressionWorker.ts"]) {
    const candidate = join(dir, name);
    if (existsSync(candidate)) return pathToFileURL(candidate);
  }
  return pathToFileURL(join(dir, "compressionWorker.js"));
}
function unchanged(body) {
  return { body, compressed: false, stats: null };
}
class CompressionWorkerPool {
  queue = [];
  workers = /* @__PURE__ */ new Set();
  nextId = 1;
  size;
  timeoutMs;
  idleMs;
  constructor({
    size = positiveInteger(process.env.OMNI_COMPRESSION_WORKERS, 2),
    timeoutMs = positiveInteger(process.env.OMNI_COMPRESSION_WORKER_TIMEOUT_MS, 12e4),
    idleMs = positiveInteger(process.env.OMNI_COMPRESSION_WORKER_IDLE_MS, 6e4)
  } = {}) {
    this.size = Math.max(1, Math.floor(size));
    this.timeoutMs = Math.max(1, Math.floor(timeoutMs));
    this.idleMs = Math.max(1, Math.floor(idleMs));
  }
  run(body, mode, options, onEngineStep) {
    return new Promise((resolve) => {
      this.queue.push({
        id: this.nextId++,
        body,
        mode,
        options,
        originalBody: body,
        resolve,
        onEngineStep
      });
      this.dispatch();
    });
  }
  async close() {
    for (const job of this.queue.splice(0)) job.resolve(unchanged(job.originalBody));
    await Promise.all([...this.workers].map((slot) => this.remove(slot, true)));
  }
  spawn() {
    const slot = {
      worker: new Worker(workerUrl()),
      job: null,
      timeout: null,
      idle: null
    };
    this.workers.add(slot);
    slot.worker.on(
      "message",
      (message) => this.handleMessage(slot, message)
    );
    slot.worker.on("error", () => this.fail(slot));
    slot.worker.on("exit", () => {
      if (this.workers.has(slot)) this.fail(slot);
    });
    return slot;
  }
  dispatch() {
    while (this.queue.length) {
      let slot = [...this.workers].find((candidate) => !candidate.job);
      if (!slot && this.workers.size < this.size) slot = this.spawn();
      if (!slot) return;
      if (slot.idle) clearTimeout(slot.idle);
      const job = this.queue.shift();
      if (!job) return;
      slot.job = job;
      slot.timeout = setTimeout(() => this.fail(slot), this.timeoutMs);
      slot.timeout.unref();
      const { originalBody: _body, resolve: _resolve, onEngineStep: _step, ...wireJob } = job;
      slot.worker.postMessage(wireJob);
    }
  }
  handleMessage(slot, message) {
    const job = slot.job;
    if (!job || job.id !== message.id) return;
    if (message.type === "step") {
      try {
        job.onEngineStep?.(message.step);
      } catch {
      }
      return;
    }
    this.finish(slot, message.type === "result" ? message.result : unchanged(job.originalBody));
  }
  finish(slot, result) {
    const job = slot.job;
    if (!job) return;
    if (slot.timeout) clearTimeout(slot.timeout);
    slot.timeout = null;
    slot.job = null;
    job.resolve(result);
    slot.idle = setTimeout(() => void this.remove(slot, false), this.idleMs);
    slot.idle.unref();
    this.dispatch();
  }
  fail(slot) {
    const job = slot.job;
    if (job) job.resolve(unchanged(job.originalBody));
    slot.job = null;
    void this.remove(slot, true).finally(() => this.dispatch());
  }
  async remove(slot, terminate) {
    if (!this.workers.delete(slot)) return;
    if (slot.timeout) clearTimeout(slot.timeout);
    if (slot.idle) clearTimeout(slot.idle);
    if (terminate) await slot.worker.terminate().catch(() => void 0);
  }
}
let pool = null;
function runCompressionInWorker(body, mode, options, onEngineStep) {
  pool ??= new CompressionWorkerPool();
  return pool.run(body, mode, options, onEngineStep);
}
async function closeCompressionWorkerPoolForTests() {
  const active = pool;
  pool = null;
  await active?.close();
}
export {
  CompressionWorkerPool,
  closeCompressionWorkerPoolForTests,
  runCompressionInWorker
};
