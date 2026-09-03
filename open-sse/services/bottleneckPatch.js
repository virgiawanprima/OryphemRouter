import Bottleneck from "../utils/omni/bottleneckShim.js";
import { log } from "../utils/log.js";
let heartbeatPatched = false;
function applyBottleneckHeartbeatPatch() {
  if (heartbeatPatched) return;
  heartbeatPatched = true;
  const probe = new Bottleneck({});
  const store = probe._store;
  const proto = Object.getPrototypeOf(store);
  void probe.disconnect();
  const originalStartHeartbeat = proto._startHeartbeat;
  if (typeof originalStartHeartbeat !== "function") {
    log.warn("BOTTLENECK", "[bottleneck-patch] _startHeartbeat not found on LocalDatastore, patch skipped");
    return;
  }
  proto._startHeartbeat = function patchedStartHeartbeat() {
    const opts = this.storeOptions ?? {};
    const wantsHeartbeat = opts.reservoirRefreshInterval != null && opts.reservoirRefreshAmount != null || opts.reservoirIncreaseInterval != null && opts.reservoirIncreaseAmount != null;
    if (this.heartbeat != null) {
      if (wantsHeartbeat) return;
      clearInterval(this.heartbeat);
      this.heartbeat = null;
      return;
    }
    return originalStartHeartbeat.call(this);
  };
  log.info("BOTTLENECK", "[bottleneck-patch] Applied _startHeartbeat fix for Bottleneck v2.19.5");
}
let patched = false;
function applyBottleneckDoExpirePatch() {
  if (patched) return;
  patched = true;
  const proto = Bottleneck.prototype;
  const originalRun = proto._run;
  if (typeof originalRun !== "function") {
    log.warn("BOTTLENECK", "[bottleneck-patch] _run not found on prototype, patch skipped");
    return;
  }
  proto._run = function patchedRun(index, job, wait) {
    if (typeof job?.doExpire === "function" && !job._doExpirePatched) {
      job._doExpirePatched = true;
      const originalDoExpire = job.doExpire.bind(job);
      const jobId = job.options.id;
      job.doExpire = function fixedDoExpire(clearGlobalState, run, free) {
        const states = job._states;
        const currentStatus = states?.jobStatus?.(jobId);
        if (currentStatus === "RUNNING") {
          states?.next?.(jobId);
          log.warn(
            "BOTTLENECK",
            `[bottleneck-patch] doExpire bug triggered: job ${jobId} stuck in RUNNING, advanced to EXECUTING before expiry. This is the Bottleneck v2.19.5 capacity leak.`
          );
        }
        return originalDoExpire(clearGlobalState, run, free);
      };
    }
    return originalRun.call(this, index, job, wait);
  };
  log.info("BOTTLENECK", "[bottleneck-patch] Applied doExpire fix for Bottleneck v2.19.5");
}
export {
  applyBottleneckDoExpirePatch,
  applyBottleneckHeartbeatPatch
};
