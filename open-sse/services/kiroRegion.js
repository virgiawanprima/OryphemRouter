const AWS_REGION_PATTERN = /^[a-z]{2}-[a-z]+-\d{1,2}$/;
const KIRO_PROFILE_REGIONS = ["us-east-1", "eu-central-1"];
function kiroRuntimeHost(region) {
  return region === "us-east-1" ? "https://codewhisperer.us-east-1.amazonaws.com" : `https://q.${region}.amazonaws.com`;
}
function regionFromKiroProfileArn(profileArn) {
  if (typeof profileArn !== "string") return void 0;
  return profileArn.toLowerCase().match(/^arn:aws:codewhisperer:([a-z0-9-]+):/)?.[1];
}
function normalizeRegion(region) {
  return typeof region === "string" ? region.trim().toLowerCase() : "";
}
function resolveKiroRuntimeRegion(providerSpecificData) {
  const fromArn = regionFromKiroProfileArn(
    typeof providerSpecificData?.profileArn === "string" ? providerSpecificData.profileArn : void 0
  );
  if (fromArn) return fromArn;
  const stored = normalizeRegion(providerSpecificData?.region);
  if (stored && KIRO_PROFILE_REGIONS.includes(stored)) return stored;
  return "us-east-1";
}
function buildKiroProfileDiscoveryRegions(storedRegion) {
  const stored = normalizeRegion(storedRegion);
  const preferEu = /^(eu|af|me|il)-/.test(stored);
  const regions = preferEu ? ["eu-central-1", "us-east-1"] : ["us-east-1", "eu-central-1"];
  if (stored && AWS_REGION_PATTERN.test(stored) && !regions.includes(stored)) {
    regions.push(stored);
  }
  return regions;
}
async function listKiroProfileArnForRegion(accessToken, region, fetchImpl) {
  if (!AWS_REGION_PATTERN.test(region)) return void 0;
  try {
    const response = await fetchImpl(`${kiroRuntimeHost(region)}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-amz-json-1.0",
        Accept: "application/json",
        "x-amz-target": "AmazonCodeWhispererService.ListAvailableProfiles",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ maxResults: 10 }),
      // Never let a hung/region-mismatched profile lookup block login or the quota refresh.
      signal: AbortSignal.timeout(1e4)
    });
    if (!response.ok) return void 0;
    const data = await response.json();
    const profiles = Array.isArray(data?.profiles) ? data.profiles : [];
    const matched = profiles.find((profile) => {
      const arn2 = profile?.arn;
      return typeof arn2 === "string" && regionFromKiroProfileArn(arn2) === region;
    }) || profiles[0];
    const arn = matched?.arn;
    return typeof arn === "string" && arn.length > 0 ? arn : void 0;
  } catch {
    return void 0;
  }
}
async function discoverKiroProfileArnAcrossRegions(accessToken, storedRegion, fetchImpl) {
  const token = typeof accessToken === "string" ? accessToken.trim() : "";
  if (!token) return void 0;
  const doFetch = fetchImpl ?? globalThis.fetch;
  for (const region of buildKiroProfileDiscoveryRegions(storedRegion)) {
    const arn = await listKiroProfileArnForRegion(token, region, doFetch);
    if (arn) return arn;
  }
  return void 0;
}
export {
  AWS_REGION_PATTERN,
  KIRO_PROFILE_REGIONS,
  buildKiroProfileDiscoveryRegions,
  discoverKiroProfileArnAcrossRegions,
  kiroRuntimeHost,
  regionFromKiroProfileArn,
  resolveKiroRuntimeRegion
};
