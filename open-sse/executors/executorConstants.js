// Executor helper constants ported from OmniRoute config/constants.ts.
import { PROVIDERS } from "../config/providers.js";

// Timeout for receiving the initial upstream response (ms).
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 30_000;
export { PROVIDERS };
