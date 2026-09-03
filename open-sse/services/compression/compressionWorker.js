import { parentPort } from "node:worker_threads";
import {
  applyCompression,
  applyStackedCompression
} from "./strategySelector.js";
if (!parentPort) throw new Error("compressionWorker must run in a worker thread");
parentPort.on("message", (job) => {
  try {
    const onEngineStep = (step) => parentPort.postMessage({
      id: job.id,
      type: "step",
      step
    });
    const result = job.mode === "stacked" ? applyStackedCompression(job.body, job.options?.config?.stackedPipeline, {
      ...job.options,
      onEngineStep
    }) : applyCompression(job.body, job.mode, job.options);
    parentPort.postMessage({
      id: job.id,
      type: "result",
      result
    });
  } catch (error) {
    parentPort.postMessage({
      id: job.id,
      type: "error",
      error: error instanceof Error ? error.message : String(error)
    });
  }
});
