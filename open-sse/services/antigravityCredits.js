import { isCreditsDisabled, recordCreditsFailure } from "./antigravity429Engine.js";
function injectCreditsField(body) {
  return {
    ...body,
    enabledCreditTypes: ["GOOGLE_ONE_AI"]
  };
}
function shouldRetryWithCredits(authKey, creditsMode) {
  if (creditsMode !== "retry") return false;
  if (isCreditsDisabled(authKey)) return false;
  return true;
}
function handleCreditsFailure(authKey) {
  return recordCreditsFailure(authKey);
}
function getCreditsMode() {
  const raw = (process.env.ANTIGRAVITY_CREDITS || "").trim().toLowerCase();
  if (raw === "always" || raw === "retry") return raw;
  return "off";
}
function shouldUseCreditsFirst(authKey, creditsMode) {
  if (creditsMode !== "always") return false;
  if (isCreditsDisabled(authKey)) return false;
  return true;
}
export {
  getCreditsMode,
  handleCreditsFailure,
  injectCreditsField,
  shouldRetryWithCredits,
  shouldUseCreditsFirst
};
