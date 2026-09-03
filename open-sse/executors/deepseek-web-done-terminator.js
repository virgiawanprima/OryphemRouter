const DEEPSEEK_FINISHED_DRAIN_MS = 750;
function createFinishOnceGuard(finish) {
  let streamFinished = false;
  return {
    finishOnce: () => {
      if (streamFinished) return;
      streamFinished = true;
      try {
        finish();
      } catch {
      }
    },
    hasFinished: () => streamFinished
  };
}
function createFinishedDrainScheduler(finishStream, drainMs = DEEPSEEK_FINISHED_DRAIN_MS) {
  let finishedDrainTimer = null;
  const clearFinishedDrain = () => {
    if (finishedDrainTimer) {
      clearTimeout(finishedDrainTimer);
      finishedDrainTimer = null;
    }
  };
  const scheduleFinishAfterDrain = () => {
    clearFinishedDrain();
    finishedDrainTimer = setTimeout(() => {
      finishedDrainTimer = null;
      finishStream();
    }, drainMs);
  };
  return {
    scheduleFinishAfterDrain,
    clearFinishedDrain,
    isDrainPending: () => finishedDrainTimer !== null
  };
}
export {
  DEEPSEEK_FINISHED_DRAIN_MS,
  createFinishOnceGuard,
  createFinishedDrainScheduler
};
