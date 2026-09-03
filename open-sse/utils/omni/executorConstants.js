// OryphemRouter executor constants superset (utils/omni variant).
// The existing open-sse/executors/executorConstants.js only carries
// FETCH_TIMEOUT_MS + PROVIDERS; this module adds the extra constants ported
// executors need (HTTP_STATUS, STREAM_READINESS_TIMEOUT_MS) so files like
// glm.js / dario.js can import everything from one place.

export { HTTP_STATUS } from "../../config/runtimeConfig.js";
import { PROVIDERS } from "../../config/providers.js";

export const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 30_000;
export const STREAM_READINESS_TIMEOUT_MS =
  Number(process.env.STREAM_READINESS_TIMEOUT_MS) || 80_000;
export const MAX_TOOLS_LIMIT = 128;

export { PROVIDERS };
