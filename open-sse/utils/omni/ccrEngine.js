// ADAPTED STUB — deep app infra (OmniRoute open-sse/services/compression/engines/ccr).
export const MAX_CCR_MCP_FULL_BYTES = 200_000;
export async function buildCcrReference(_text) { return null; }
export async function deleteCcrBlock(_id) { return false; }
export async function getCcrStoreStats() { return { blocks: 0, bytes: 0 }; }
export async function handleCcrRetrieve(_reference) { return null; }
export async function inspectCcrBlock(_id) { return null; }
export function isCcrStoreRejection(_error) { return false; }
export async function listCcrBlocks() { return []; }
export async function tryStoreBlock(_text) { return null; }
