// ADAPTATION for OryphemRouter.
// OmniRoute's `@/lib/batches/dispatch` enqueues batch jobs onto the local worker queue.
// Deep app infra — stubbed with graceful fallback (no-op dispatch) for `batchProcessor`.

/**
 * Dispatch a batch job. In OmniRoute this schedules the batch for processing via the
 * local DB + worker queue; in this adaptation it returns a resolved no-op so the
 * caller can still reason about the record.
 */
export async function dispatch(batchId, opts) {
  return { id: batchId, queued: false, adapter: "noop", ...(opts ?? {}) };
}
