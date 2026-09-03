import {
  createTlsClientModule
} from "./tlsClientBase.js";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_GROK_TLS_TIMEOUT_MS || "", 10) || 6e4;
const HARD_TIMEOUT_GRACE_MS = Number.parseInt(process.env.OMNIROUTE_GROK_TLS_GRACE_MS || "", 10) || 1e4;
const tlsClientModule = createTlsClientModule({
  providerName: "Grok",
  tlsProfile: "chrome_146",
  domain: "https://grok.com",
  tempDirPrefix: "grok-stream-",
  tailFileVariant: "B1",
  responseValidation: "cf",
  exportCloudflareCheck: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS
});
const tlsFetchGrok = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
const __setTlsFetchOverrideForTesting = tlsClientModule.__setTlsFetchOverrideForTesting;
import { TlsClientHangError, TlsClientUnavailableError } from "./tlsClientBase.js";
import { isCloudflareChallenge } from "./tlsClientBase.js";
export {
  TlsClientHangError,
  TlsClientUnavailableError,
  __setTlsFetchOverrideForTesting,
  isCloudflareChallenge,
  tlsClientModule,
  tlsFetchGrok
};
