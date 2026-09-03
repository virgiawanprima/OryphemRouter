// ADAPTED STUB (applyAntigravityClientProfileHeaders from services/antigravityClientProfile.ts).
import { normalizeAntigravityClientProfile, DEFAULT_ANTIGRAVITY_CLIENT_PROFILE } from "./antigravityClientProfile.js";
export function applyAntigravityClientProfileHeaders(headers, credentials, body) {
  if (!headers || typeof headers !== "object") return DEFAULT_ANTIGRAVITY_CLIENT_PROFILE;
  const profile = normalizeAntigravityClientProfile(
    credentials && credentials.providerSpecificData && credentials.providerSpecificData.clientProfile
  );
  delete headers["User-Agent"];
  delete headers["user-agent"];
  headers["User-Agent"] = "antigravity";
  return profile;
}
