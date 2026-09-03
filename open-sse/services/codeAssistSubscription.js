function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function pickTierField(tier, field) {
  const record = toRecord(tier);
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
function isIneligible(subscription) {
  const ineligible = subscription.ineligibleTiers;
  return Array.isArray(ineligible) && ineligible.length > 0;
}
function findDefaultAllowedTier(subscription) {
  if (!Array.isArray(subscription.allowedTiers)) return null;
  for (const tierValue of subscription.allowedTiers) {
    const tier = toRecord(tierValue);
    if (tier.isDefault) return tier;
  }
  return null;
}
function extractCodeAssistSubscriptionTier(subscriptionInfo) {
  const subscription = toRecord(subscriptionInfo);
  if (Object.keys(subscription).length === 0) return null;
  let tier = pickTierField(subscription.paidTier, "name") || pickTierField(subscription.paidTier, "id");
  if (!tier) {
    if (!isIneligible(subscription)) {
      tier = pickTierField(subscription.currentTier, "name") || pickTierField(subscription.currentTier, "id");
    } else {
      const defaultTier = findDefaultAllowedTier(subscription);
      if (defaultTier) {
        const name = pickTierField(defaultTier, "name");
        const id = pickTierField(defaultTier, "id");
        if (name) tier = `${name} (Restricted)`;
        else if (id) tier = `${id} (Restricted)`;
      }
    }
  }
  return tier;
}
function extractCodeAssistOnboardTierId(subscriptionInfo) {
  const subscription = toRecord(subscriptionInfo);
  const paidId = pickTierField(subscription.paidTier, "id");
  if (paidId) return paidId;
  if (!isIneligible(subscription)) {
    const currentId2 = pickTierField(subscription.currentTier, "id");
    if (currentId2) return currentId2;
  }
  const defaultTier = findDefaultAllowedTier(subscription);
  const defaultId = defaultTier ? pickTierField(defaultTier, "id") : null;
  if (defaultId) return defaultId;
  const currentId = pickTierField(subscription.currentTier, "id");
  if (currentId) return currentId;
  return "legacy-tier";
}
export {
  extractCodeAssistOnboardTierId,
  extractCodeAssistSubscriptionTier
};
