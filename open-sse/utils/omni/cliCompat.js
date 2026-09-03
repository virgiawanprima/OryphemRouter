function normalizeCliCompatProviderId(providerId) {
  const normalized = providerId.toLowerCase();
  if (normalized === "copilot") return "github";
  return normalized;
}
export {
  normalizeCliCompatProviderId
};
