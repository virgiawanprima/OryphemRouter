function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
function toTrimmedString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}
function normalizeModelIdList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry) => typeof entry === "string" && entry.length > 0);
}
function getAlibabaFreeTierQuotaLastSyncAt(providerSpecificData) {
  return toTrimmedString(asRecord(providerSpecificData).alibabaFreeTierQuotaLastSyncAt);
}
function isAlibabaLiveQuotaSyncAt(syncAt) {
  if (!syncAt || syncAt === "builtin-allowlist") return false;
  return Number.isFinite(Date.parse(syncAt));
}
export {
  asRecord,
  getAlibabaFreeTierQuotaLastSyncAt,
  isAlibabaLiveQuotaSyncAt,
  normalizeModelIdList,
  toTrimmedString
};
