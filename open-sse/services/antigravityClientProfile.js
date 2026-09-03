import {
  normalizeAntigravityClientProfile
} from "../utils/omni/antigravityClientProfile.js";
import { getAntigravityContentHeaders } from "./antigravityHeaders.js";
import {
  resolveAntigravityCliVersion,
  resolveAntigravityIdeVersion
} from "./antigravityVersion.js";
import {
  ANTIGRAVITY_CLIENT_PROFILE_VALUES,
  DEFAULT_ANTIGRAVITY_CLIENT_PROFILE as DEFAULT_ANTIGRAVITY_CLIENT_PROFILE2,
  normalizeAntigravityClientProfile as normalizeAntigravityClientProfile2
} from "../utils/omni/antigravityClientProfile.js";
const ABSENT_CONTENT_IDENTITY_HEADERS = [
  "x-client-name",
  "x-client-version",
  "x-machine-id",
  "x-vscode-sessionid",
  "X-Goog-Api-Client",
  "Client-Metadata"
];
function getAntigravityClientProfile(credentials) {
  const fromProviderData = credentials?.providerSpecificData && typeof credentials.providerSpecificData === "object" && !Array.isArray(credentials.providerSpecificData) ? credentials.providerSpecificData.clientProfile : void 0;
  return normalizeAntigravityClientProfile(fromProviderData);
}
function resolveAntigravityClientVersion(profile) {
  return profile === "cli" ? resolveAntigravityCliVersion() : resolveAntigravityIdeVersion();
}
function removeHeaderCaseInsensitive(headers, name) {
  const lowerName = name.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      delete headers[key];
    }
  }
}
function getProjectHeaderValue(body) {
  const project = body && typeof body === "object" ? body.project : null;
  if (typeof project !== "string" || project.trim().length === 0) return null;
  if (project === "test-project" || project === "project-id") return null;
  return project;
}
function applyAntigravityClientProfileHeaders(headers, credentials, body) {
  const profile = getAntigravityClientProfile(credentials);
  const identityHeaders = getAntigravityContentHeaders(profile);
  removeHeaderCaseInsensitive(headers, "User-Agent");
  headers["User-Agent"] = identityHeaders["User-Agent"];
  for (const name of ABSENT_CONTENT_IDENTITY_HEADERS) {
    removeHeaderCaseInsensitive(headers, name);
  }
  const project = getProjectHeaderValue(body);
  removeHeaderCaseInsensitive(headers, "x-goog-user-project");
  if (project) {
    headers["x-goog-user-project"] = project;
  }
  return profile;
}
export {
  ANTIGRAVITY_CLIENT_PROFILE_VALUES,
  DEFAULT_ANTIGRAVITY_CLIENT_PROFILE2 as DEFAULT_ANTIGRAVITY_CLIENT_PROFILE,
  applyAntigravityClientProfileHeaders,
  getAntigravityClientProfile,
  normalizeAntigravityClientProfile2 as normalizeAntigravityClientProfile,
  removeHeaderCaseInsensitive,
  resolveAntigravityClientVersion
};
