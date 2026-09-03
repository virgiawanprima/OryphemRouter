import {
  createTlsClientModule
} from "./tlsClientBase.js";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_NOTION_TLS_TIMEOUT_MS || "", 10) || 3e4;
const HARD_TIMEOUT_GRACE_MS = Number.parseInt(process.env.OMNIROUTE_NOTION_TLS_GRACE_MS || "", 10) || 1e4;
const tlsClientModule = createTlsClientModule({
  providerName: "Notion",
  tlsProfile: "chrome_146",
  domain: "https://app.notion.com",
  tempDirPrefix: "pplx-stream-",
  tailFileVariant: "A",
  responseValidation: "sse",
  exportCloudflareCheck: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS
});
const tlsFetchNotion = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
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
  tlsFetchNotion
};
