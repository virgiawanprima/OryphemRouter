import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { log } from "../utils/log.js";
const CREDENTIAL_FIELDS = [
  "clientId",
  "clientSecret",
  "tokenUrl",
  "authUrl",
  "refreshUrl"
];
const CONFIG_TTL_MS = 6e4;
let lastLoadTime = 0;
let cachedProviders = null;
function credGlobals() {
  return globalThis;
}
// Adapted port: OmniRoute resolved the data dir via `require("@/lib/dataPaths")`
// (app infra). In OryphemRouter's standalone ESM config module that require is
// not available, so we always use the env/`data`-dir fallback.
function resolveCredentialsPath() {
  const fallbackDataDir = process.env.DATA_DIR || join(process.cwd(), "data");
  return join(fallbackDataDir, "provider-credentials.json");
}
function loadProviderCredentials(providers) {
  if (cachedProviders && Date.now() - lastLoadTime < CONFIG_TTL_MS) {
    return cachedProviders;
  }
  const credPath = resolveCredentialsPath();
  if (!existsSync(credPath)) {
    if (!credGlobals().__omnirouteCredNoFileLogged) {
      log.info("CREDENTIALS", "No external credentials file found, using defaults.");
      credGlobals().__omnirouteCredNoFileLogged = true;
    }
    cachedProviders = providers;
    lastLoadTime = Date.now();
    return providers;
  }
  try {
    const raw = readFileSync(credPath, "utf-8");
    const external = JSON.parse(raw);
    let overrideCount = 0;
    const mutableProviders = providers;
    for (const [providerKey, creds] of Object.entries(external)) {
      if (!mutableProviders[providerKey]) {
        log.info(
          "CREDENTIALS",
          `Warning: unknown provider "${providerKey}" in credentials file, skipping.`
        );
        continue;
      }
      if (!creds || typeof creds !== "object") {
        log.info(
          "CREDENTIALS",
          `Warning: provider "${providerKey}" value must be an object, got ${typeof creds}. Skipping.`
        );
        continue;
      }
      const credentialOverrides = creds;
      for (const field of CREDENTIAL_FIELDS) {
        if (credentialOverrides[field] !== void 0) {
          mutableProviders[providerKey][field] = credentialOverrides[field];
          overrideCount++;
        }
      }
    }
    const isReload = cachedProviders !== null;
    log.info(
      "CREDENTIALS",
      `${isReload ? "Reloaded" : "Loaded"} external credentials: ${overrideCount} field(s) from ${credPath}`
    );
  } catch (err) {
    const reason = err instanceof SyntaxError ? "Invalid JSON format" : err.code || "read error";
    log.info(`CREDENTIALS`, `Error reading credentials file (${reason}). Using defaults.`);
  }
  cachedProviders = providers;
  lastLoadTime = Date.now();
  return providers;
}
export {
  loadProviderCredentials
};
