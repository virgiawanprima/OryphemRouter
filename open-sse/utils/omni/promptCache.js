// ADAPTED — graceful fallback (was @/lib/promptCache).
import { createHash } from "node:crypto";

export function generatePromptCacheKey(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return null;
  try {
    return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
  } catch {
    return null;
  }
}