import { getConsistentMachineId } from "@/shared/utils/machineId";

export const CLI_TOKEN_HEADER = "x-9r-cli-token";
const CLI_TOKEN_SALT = "9r-cli-auth";

let cachedCliToken = null;
async function getCliToken() {
  if (!cachedCliToken) cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

/**
 * Verify that the request carries the machine-specific CLI token, not merely
 * the presence of the header. Callers must not trust header presence alone,
 * otherwise any caller could bypass password re-auth.
 *
 * @param {Request} request
 * @returns {Promise<boolean>}
 */
export async function hasValidCliToken(request) {
  const token = request.headers.get(CLI_TOKEN_HEADER);
  if (!token) return false;
  return token === await getCliToken();
}
