const ANTIGRAVITY_RUNTIME_BASE_URLS = Object.freeze([
  "https://daily-cloudcode-pa.googleapis.com",
  "https://cloudcode-pa.googleapis.com"
]);
const ANTIGRAVITY_DISCOVERY_BASE_URLS = Object.freeze([
  ...ANTIGRAVITY_RUNTIME_BASE_URLS,
  "https://daily-cloudcode-pa.sandbox.googleapis.com"
]);
const ANTIGRAVITY_BOOTSTRAP_BASE_URLS = Object.freeze([
  "https://cloudcode-pa.googleapis.com"
]);
const ANTIGRAVITY_ONBOARD_PATH = "/v1internal:onboardUser";
function getAntigravityOnboardUrls() {
  return ANTIGRAVITY_BOOTSTRAP_BASE_URLS.map((base) => `${base}${ANTIGRAVITY_ONBOARD_PATH}`);
}
const ANTIGRAVITY_MODELS_PATH = "/v1internal:models";
const ANTIGRAVITY_FETCH_AVAILABLE_MODELS_PATH = "/v1internal:fetchAvailableModels";
function buildAntigravityDiscoveryUrls(path) {
  return ANTIGRAVITY_DISCOVERY_BASE_URLS.map((baseUrl) => `${baseUrl}${path}`);
}
function getAntigravityModelsDiscoveryUrls() {
  return buildAntigravityDiscoveryUrls(ANTIGRAVITY_MODELS_PATH);
}
function getAntigravityFetchAvailableModelsUrls() {
  return buildAntigravityDiscoveryUrls(ANTIGRAVITY_FETCH_AVAILABLE_MODELS_PATH);
}
export {
  ANTIGRAVITY_BOOTSTRAP_BASE_URLS,
  ANTIGRAVITY_DISCOVERY_BASE_URLS,
  ANTIGRAVITY_ONBOARD_PATH,
  ANTIGRAVITY_RUNTIME_BASE_URLS,
  getAntigravityFetchAvailableModelsUrls,
  getAntigravityModelsDiscoveryUrls,
  getAntigravityOnboardUrls
};
