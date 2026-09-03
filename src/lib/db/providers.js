// providers — provider-connection data access for ported open-sse code
// (adobeFireflySession.js imports updateProviderConnection from here).
//
// Mirrors the OmniRoute @/lib/db/providers contract, backed by the real
// provider-connections repo. Pass-through re-exports of connectionsRepo.

export {
  getProviderConnections,
  getProviderConnectionById,
  createProviderConnection,
  updateProviderConnection,
  deleteProviderConnection,
} from "./repos/connectionsRepo.js";
