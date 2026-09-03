import {
  createTlsClientModule
} from "./tlsClientBase.js";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_CHATGPT_TLS_TIMEOUT_MS || "", 10) || 6e4;
const HARD_TIMEOUT_GRACE_MS = Number.parseInt(process.env.OMNIROUTE_CHATGPT_TLS_GRACE_MS || "", 10) || 1e4;
const STREAM_FIRST_BYTE_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_CHATGPT_STREAM_FIRST_BYTE_TIMEOUT_MS || "", 10) || 3e4;
const tlsClientModule = createTlsClientModule({
  providerName: "ChatGPT",
  tlsProfile: "firefox_148",
  domain: "https://chatgpt.com",
  tempDirPrefix: "cgpt-stream-",
  tailFileVariant: "A",
  responseValidation: "sse",
  exportCloudflareCheck: false,
  exposeStreamingForTesting: true,
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS,
  firstByteTimeoutMs: STREAM_FIRST_BYTE_TIMEOUT_MS
});
const tlsFetchChatGpt = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
const __tlsFetchStreamingForTesting = tlsClientModule.__tlsFetchStreamingForTesting;
const __setTlsFetchOverrideForTesting = tlsClientModule.__setTlsFetchOverrideForTesting;
import { TlsClientHangError, TlsClientUnavailableError } from "./tlsClientBase.js";
import { looksLikeSse } from "./tlsClientBase.js";
export {
  TlsClientHangError,
  TlsClientUnavailableError,
  __setTlsFetchOverrideForTesting,
  __tlsFetchStreamingForTesting,
  looksLikeSse,
  tlsClientModule,
  tlsFetchChatGpt
};
