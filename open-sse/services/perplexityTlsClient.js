import {
  createTlsClientModule
} from "./tlsClientBase.js";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_PPLX_TLS_TIMEOUT_MS || "", 10) || 3e4;
const HARD_TIMEOUT_GRACE_MS = Number.parseInt(process.env.OMNIROUTE_PPLX_TLS_GRACE_MS || "", 10) || 1e4;
const tlsClientModule = createTlsClientModule({
  providerName: "Perplexity",
  tlsProfile: "firefox_148",
  domain: "https://www.perplexity.ai",
  tempDirPrefix: "pplx-stream-",
  tailFileVariant: "A",
  responseValidation: "sse",
  exportCloudflareCheck: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS
});
const tlsFetchPerplexity = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
const __setTlsFetchOverrideForTesting = tlsClientModule.__setTlsFetchOverrideForTesting;
import { TlsClientHangError, TlsClientUnavailableError } from "./tlsClientBase.js";
import { looksLikeSse, isCloudflareChallenge } from "./tlsClientBase.js";
export {
  TlsClientHangError,
  TlsClientUnavailableError,
  __setTlsFetchOverrideForTesting,
  isCloudflareChallenge,
  looksLikeSse,
  tlsClientModule,
  tlsFetchPerplexity
};
