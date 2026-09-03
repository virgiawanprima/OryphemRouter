// ADAPTED STUB — adds the `defaultLogger` alias (OmniRoute's
// `@omniroute/open-sse/utils/logger` exports `defaultLogger`) on top of the
// existing OryphemRouter logger facade (utils/omni/logger.js).
import { logger } from "./logger.js";

export const defaultLogger = logger;
export default { defaultLogger };
