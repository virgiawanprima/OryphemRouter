// Minimal adaptation of OmniRoute `@/shared/services/cliRuntime` (deep app infra).
// Only the pieces qoderCli/qoderCliResolve need. Production cliRuntime performs
// sync fs walks + --version healthchecks; here we resolve to the bare command or
// CLI_QODER_BIN and let spawn surface real ENOENTs.
import path from "node:path";
export function getLookupEnv() {
  const env = { ...process.env };
  const extraPaths = String(process.env.CLI_EXTRA_PATHS || "").split(":").filter(Boolean);
  const basePath = env.PATH || env.Path || "";
  const merged = [...extraPaths, basePath].filter(Boolean).join(":");
  if (merged) {
    env.PATH = merged;
    if (process.platform === "win32") env.Path = merged;
  }
  return env;
}
export async function getCliRuntimeStatus(toolId) {
  const explicit = String(process.env.CLI_QODER_BIN || "").trim();
  const commandPath = explicit || "qodercli";
  return { toolId, installed: true, commandPath, reason: null };
}
export function shouldUseShellForCommand(command) {
  return (
    process.platform === "win32" &&
    !path.isAbsolute(command) &&
    !path.basename(command).includes(".")
  );
}
export function getKnownToolPaths(toolId) {
  const explicit = String(process.env.CLI_QODER_BIN || "").trim();
  return explicit ? [explicit] : ["qodercli"];
}
