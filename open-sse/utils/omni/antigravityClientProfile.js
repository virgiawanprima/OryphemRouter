const ANTIGRAVITY_CLIENT_PROFILE_VALUES = ["ide", "cli"];
const DEFAULT_ANTIGRAVITY_CLIENT_PROFILE = "ide";
const ANTIGRAVITY_CLIENT_PROFILE_OPTIONS = [
  { value: "ide", labelKey: "antigravityClientProfileIde" },
  { value: "cli", labelKey: "antigravityClientProfileCli" }
];
function normalizeAntigravityClientProfile(value) {
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "ide" || normalized === "cli") {
      return normalized;
    }
    if (normalized === "harness" || normalized === "sdk") {
      return "cli";
    }
  }
  return DEFAULT_ANTIGRAVITY_CLIENT_PROFILE;
}
const normalizeAntigravityClientProfileSetting = normalizeAntigravityClientProfile;
export {
  ANTIGRAVITY_CLIENT_PROFILE_OPTIONS,
  ANTIGRAVITY_CLIENT_PROFILE_VALUES,
  DEFAULT_ANTIGRAVITY_CLIENT_PROFILE,
  normalizeAntigravityClientProfile,
  normalizeAntigravityClientProfileSetting
};
