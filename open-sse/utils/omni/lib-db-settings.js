// unified by integration — canonical definitions live in ./dbSettings.js
// (lib-db-settings.js was a parallel port of OmniRoute @/lib/db/settings's
// resolveProxyForConnection for searchProxy.js; now re-exports the unified
// facade — same { proxy, level } shape the search proxy expects).
import { resolveProxyForConnection } from "./dbSettings.js";
export { resolveProxyForConnection } from "./dbSettings.js";
export default { resolveProxyForConnection };
