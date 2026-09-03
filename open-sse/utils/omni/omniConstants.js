// ADAPTED — graceful fallback for missing config constants from @/shared and config/constants.ts
export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 30_000;
export const FETCH_BODY_TIMEOUT_MS = Number(process.env.FETCH_BODY_TIMEOUT_MS) || 30_000;
export const SSE_HEARTBEAT_INTERVAL_MS = Number(process.env.SSE_HEARTBEAT_INTERVAL_MS) || 15_000;
export const EXECUTOR_CONTRACT_VIOLATION_CODE = "executor_contract_violation";
export const MAX_TOOLS_LIMIT = 128;
export { HTTP_STATUS } from "../../config/runtimeConfig.js";