import path from "path";
import {
  getCliRuntimeStatus,
  getKnownToolPaths,
  shouldUseShellForCommand
} from "../utils/omni/omniCliRuntime.js";
function getQoderCliCommand() {
  const explicit = String(process.env.CLI_QODER_BIN || "").trim();
  return explicit || "qodercli";
}
const QODER_RESOLVE_TTL_MS = 5 * 60 * 1e3;
let qoderInvocationCache = null;
function __clearQoderCliInvocationCache() {
  qoderInvocationCache = null;
}
async function resolveQoderCliInvocation(explicitCommand, deps = {}) {
  const explicit = String(explicitCommand || "").trim();
  const getStatus = deps.getStatus || getCliRuntimeStatus;
  const shouldUseShell = deps.shouldUseShell || shouldUseShellForCommand;
  const cacheable = !explicit && !deps.getStatus && !deps.shouldUseShell;
  const fallback = explicit || getQoderCliCommand();
  if (cacheable && qoderInvocationCache && qoderInvocationCache.key === fallback && qoderInvocationCache.expiresAt > Date.now()) {
    return { command: qoderInvocationCache.command, useShell: qoderInvocationCache.useShell };
  }
  let command = fallback;
  try {
    const status = await getStatus("qoder");
    if (status && status.installed && status.commandPath) {
      command = status.commandPath;
    }
  } catch {
  }
  const useShell = shouldUseShell(command) || process.platform === "win32" && !path.isAbsolute(command) && !path.basename(command).includes(".");
  const invocation = { command, useShell };
  if (cacheable) {
    qoderInvocationCache = {
      ...invocation,
      key: fallback,
      expiresAt: Date.now() + QODER_RESOLVE_TTL_MS
    };
  }
  return invocation;
}
function buildQoderCliNotFoundHint(runError) {
  let searchedHint = "";
  try {
    const candidates = getKnownToolPaths("qoder");
    if (candidates.length > 0) {
      searchedHint = ` Searched: ${candidates.slice(0, 6).join(", ")}.`;
    }
  } catch {
  }
  return `Qoder CLI (qodercli) was not found on the OmniRoute host (${runError}).` + searchedHint + " Install it from https://qoder.com, or set CLI_QODER_BIN to the absolute path of the qodercli binary (e.g. %APPDATA%\\npm\\qodercli.cmd on Windows). PAT auth is driven through the local qodercli binary.";
}
export {
  __clearQoderCliInvocationCache,
  buildQoderCliNotFoundHint,
  getQoderCliCommand,
  resolveQoderCliInvocation
};
