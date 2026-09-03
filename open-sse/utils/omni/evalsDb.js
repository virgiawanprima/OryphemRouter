// ADAPTATION for OryphemRouter.
// OmniRoute's `src/lib/db/evals.ts` persists eval runs (batched model evaluation results).
// Deep app infra — this is an in-memory fallback so `evalRouting` loads and works within a
// single process lifetime, returning no persisted runs (evaluation routing falls back to
// the default path).

const _runs = new Map(); // id -> run

export function listModelEvalRunsForRouting(model, opts = {}) {
  return [..._runs.values()].filter(
    (r) => (!model || r.model === model) && (opts.limit ? true : true)
  );
}

export function createEvalRun(data) {
  const run = { id: data.id ?? `eval_${_runs.size + 1}`, createdAt: Date.now(), ...data };
  _runs.set(run.id, run);
  return run;
}
