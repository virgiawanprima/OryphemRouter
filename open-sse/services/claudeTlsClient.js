import {
  createTlsClientModule
} from "./tlsClientBase.js";
const CLAUDE_TLS_BROWSER_MAJOR_VERSION = "146";
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.OMNIROUTE_CLAUDE_TLS_TIMEOUT_MS || "", 10) || 6e4;
const HARD_TIMEOUT_GRACE_MS = Number.parseInt(process.env.OMNIROUTE_CLAUDE_TLS_GRACE_MS || "", 10) || 1e4;
const tlsClientModule = createTlsClientModule({
  providerName: "Claude",
  tlsProfile: `chrome_${CLAUDE_TLS_BROWSER_MAJOR_VERSION}`,
  domain: "https://claude.ai",
  tempDirPrefix: "cgpt-stream-",
  tailFileVariant: "A",
  responseValidation: "sse",
  exportCloudflareCheck: false,
  exposeStreamingForTesting: true,
  // Claude waits indefinitely for the first SSE byte (original 2-arg waitForContent).
  defaultTimeoutMs: DEFAULT_TIMEOUT_MS,
  hardTimeoutGraceMs: HARD_TIMEOUT_GRACE_MS,
  firstByteTimeoutMs: Number.POSITIVE_INFINITY
});
const tlsFetchClaude = (url, options = {}) => tlsClientModule.tlsFetch(url, options);
const tlsFetchStreaming = tlsClientModule.__tlsFetchStreamingForTesting;
const __setTlsFetchOverrideForTesting = tlsClientModule.__setTlsFetchOverrideForTesting;
import { TlsClientHangError, TlsClientUnavailableError } from "./tlsClientBase.js";
import { looksLikeSse } from "./tlsClientBase.js";
export {
  CLAUDE_TLS_BROWSER_MAJOR_VERSION,
  TlsClientHangError,
  TlsClientUnavailableError,
  __setTlsFetchOverrideForTesting,
  looksLikeSse,
  tlsClientModule,
  tlsFetchClaude,
  tlsFetchStreaming
};
