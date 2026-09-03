// ADAPTED — graceful fallback (was @/lib/memory/injection).
export function shouldInjectMemory() {
  return false;
}
export function injectMemory(body) {
  return body;
}
export function buildMemoryToolsForProvider() {
  return [];
}