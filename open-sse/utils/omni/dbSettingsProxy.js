// unified by integration — canonical definitions live in ./dbSettings.js
// (dbSettingsProxy.js was a parallel port of OmniRoute @/lib/db/settings's
// resolveProxyForConnection for rerank.js; now re-exports the unified facade).
export { resolveProxyForConnection } from "./dbSettings.js";
