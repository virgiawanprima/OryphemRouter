// ADAPTED STUB — adds `hasUsableWebSessionCredential` for the services/autoCombo
// port (OmniRoute `@/shared/providers/webSessionCredentials`). No web-session
// credentials in OryphemRouter → always false (graceful).
export { WEB_SESSION_CREDENTIAL_REQUIREMENTS } from "./webSessionCredentials.js";

export function hasUsableWebSessionCredential() {
  return false;
}
export default { hasUsableWebSessionCredential };
