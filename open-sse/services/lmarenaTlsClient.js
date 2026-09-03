import {
  createTlsClientModule
} from "./tlsClientBase.js";
const DEFAULT_TIMEOUT_MS = 6e4;
const HARD_TIMEOUT_GRACE_MS = 1e4;
const tlsClientModule = createTlsClientModule({
  providerName: "LMArena",
  tlsProfile: "chrome_146",
  domain: "https://lmarena.ai",
  // LMArena's proxy resolution domain is hardcoded to arena.ai, not the config domain.
  proxyDomainOverride: "https://arena.ai",
  tempDirPrefix: "LMArena-stream-",
  tailFileVariant: "B2",
  responseValidation: "cf",
  exportCloudflareCheck: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS
});
const tlsFetchLMArena = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
const __setTlsFetchOverrideForTesting = tlsClientModule.__setTlsFetchOverrideForTesting;
import { TlsClientHangError, TlsClientUnavailableError } from "./tlsClientBase.js";
import { isCloudflareChallenge } from "./tlsClientBase.js";
export {
  TlsClientHangError,
  TlsClientUnavailableError,
  __setTlsFetchOverrideForTesting,
  isCloudflareChallenge,
  tlsClientModule,
  tlsFetchLMArena
};
