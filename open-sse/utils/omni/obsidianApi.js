// ADAPTED STUB — deep app infra (OmniRoute src/lib/obsidian/api.ts).
export class ObsidianClient {
  constructor(_config) {}
}
export class SyncServerClient {
  constructor(_baseUrl, _token) {}
}
export async function createObsidianClient(_config) {
  return new ObsidianClient(_config);
}
export async function createSyncServerClient(_baseUrl, _token) {
  return new SyncServerClient(_baseUrl, _token);
}
export async function getSyncToken(_apiKeyId) {
  return null;
}
