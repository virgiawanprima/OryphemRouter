/**
 * unified by integration — canonical definitions live in ./dbCore.js.
 * omniDbStub.js was an orphaned parallel port of OmniRoute's getDbInstance()
 * (from src/lib/db/core.ts) that threw unconditionally; it now re-exports the
 * unified db-core facade (graceful null fallback) so both paths resolve
 * identically. Callers (e.g. geminiThoughtSignatureStore) wrap persistence in
 * try/catch, so this degrades gracefully to in-memory-only operation.
 */
import { getDbInstance } from "./dbCore.js";
export { getDbInstance } from "./dbCore.js";
export default { getDbInstance };
