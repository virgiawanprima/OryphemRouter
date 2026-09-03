/**
 * ADAPTED STUB — OmniRoute's @/lib/logEnv provides log truncation limits from
 * app config/env. OryphemRouter has no such module; graceful defaults.
 */
export function getChatLogTextLimit() { return 100000; }
export function getChatLogMaxDepth() { return 6; }
export function getChatLogArrayTailItems() { return 10; }
export function getChatLogMaxObjectKeys() { return 50; }
export function getChatLogMaxBodyBytes() { return 2 * 1024 * 1024; }
export default { getChatLogTextLimit, getChatLogMaxDepth, getChatLogArrayTailItems, getChatLogMaxObjectKeys, getChatLogMaxBodyBytes };
