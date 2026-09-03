// ADAPTED STUB — OmniRoute `@/lib/dataPaths#resolveDataDir`. OryphemRouter has no
// app data-path infra; auto-combo adaptation persistence writes to a
// project-scoped temp dir (graceful, survives restarts per host).
import { join } from "node:path";
import { tmpdir } from "node:os";

export function resolveDataDir() {
  return process.env.ORYPHEM_DATA_DIR || join(tmpdir(), "oryphemrouter");
}
export default { resolveDataDir };
