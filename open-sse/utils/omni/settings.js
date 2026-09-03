// unified by integration — canonical definitions live in ./dbSettings.js
// (settings.js was a parallel port of OmniRoute @/lib/db/settings for dario.js;
// now re-exports the unified facade so all settings importers resolve identically).
export { getSettings, getSetting } from "./dbSettings.js";
