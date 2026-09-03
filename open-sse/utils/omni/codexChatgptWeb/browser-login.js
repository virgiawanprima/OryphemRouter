// OryphemRouter adaptation stub for the ChatGPT-Web (Codex) browser-login
// module. Real browser login is not ported; these exports keep the executor
// loadable and behave conservatively (assume no verified login exists and
// report no pro capability).

export function loginVerificationMarkerPath(storageStatePath) {
  return `${storageStatePath}.login-verified.json`;
}

export function writeVerificationMarker(_storageStatePath, _proAvailable) {
  /* no-op */
}

export function browserLoginStateExists(_config) {
  return false;
}

export async function inspectBrowserLoginCapabilities(_config) {
  return { proAvailable: false, browserVerified: true };
}

export function storedBrowserLoginCapabilities(_config) {
  return { proAvailable: false };
}

export async function loginToChatGpt() {
  throw new Error(
    "ChatGPT Web (Codex) browser login is not available in OryphemRouter — the " +
      "codex-chatgpt-web vendor stack was not ported."
  );
}

export async function checkBrowserEngine() {
  /* no-op */
}
