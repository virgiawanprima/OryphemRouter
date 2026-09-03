import { registerAgentrouterQuotaFetcher } from "./agentrouterQuotaFetcher.js";
import { registerV0QuotaFetcher } from "./v0QuotaFetcher.js";
import { registerFreeModelQuotaFetcher } from "./freeModelQuotaFetcher.js";
import { registerGrokCliQuotaFetcher } from "./grokCliQuotaFetcher.js";
import { registerXaiOauthQuotaFetcher } from "./xaiOauthQuotaFetcher.js";
import { registerFirecrawlQuotaFetcher } from "./firecrawlQuotaFetcher.js";
function registerQuotaTrackersBatch() {
  registerAgentrouterQuotaFetcher();
  registerV0QuotaFetcher();
  registerFreeModelQuotaFetcher();
  registerGrokCliQuotaFetcher();
  registerXaiOauthQuotaFetcher();
  registerFirecrawlQuotaFetcher();
}
registerQuotaTrackersBatch();
export {
  registerQuotaTrackersBatch
};
