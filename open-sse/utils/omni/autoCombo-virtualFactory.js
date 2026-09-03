/**
 * ADAPTED STUB — OmniRoute's services/autoCombo/virtualFactory.ts (createVirtualAutoCombo)
 * is app infra not present in OryphemRouter. Graceful fallback: empty candidate pool.
 */
export async function createVirtualAutoCombo() { return { models: [] }; }
export default { createVirtualAutoCombo };
