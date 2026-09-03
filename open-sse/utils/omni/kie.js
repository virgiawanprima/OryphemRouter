// ADAPTED STUB (was executors/kie.ts in OmniRoute). Graceful no-op executor.
import { BaseExecutor } from "../../executors/base.js";
export class KieExecutor extends BaseExecutor {}
export async function kieExecutor(args) {
  return { success: false, status: 501, error: "kieExecutor not ported to OryphemRouter (stub)" };
}
export default KieExecutor;
