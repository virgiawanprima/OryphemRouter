// ADAPTED — graceful fallback (was @/lib/skills/injection).
export function injectSkills({ existingTools = [] } = {}) {
  return existingTools;
}
export function buildMemoryToolsForProvider() {
  return [];
}