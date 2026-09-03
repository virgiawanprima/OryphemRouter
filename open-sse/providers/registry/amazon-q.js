// Amazon Q — AWS Q Developer (same AWS Builder ID / refresh-token flow as Kiro).
// Shares the Kiro/AWS Q event-stream surface; usage tracked (USAGE_FETCHER_PROVIDERS).
export default {
  id: "amazon-q",
  alias: "aq",
  display: {
    name: "Amazon Q",
    icon: "cloud",
    color: "#FF9900",
    textIcon: "AQ",
    website: "https://aws.amazon.com/q/developer/",
    notice: {
      text: "Uses the same AWS Builder ID or imported refresh-token flow as Kiro, but keeps Amazon Q connections separate.",
    },
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  authModes: ["oauth"],
  transport: {
    baseUrl: "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
    baseUrls: [
      "https://q.us-east-1.amazonaws.com/generateAssistantResponse",
      "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse",
    ],
    format: "kiro",
    executor: "kiro",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/vnd.amazon.eventstream",
      "User-Agent": "AWS-SDK-JS/3.0.0 kiro-ide/1.0.0",
      "X-Amz-User-Agent": "aws-sdk-js/3.0.0 kiro-ide/1.0.0",
    },
    usage: {
      cwHost: "https://codewhisperer.us-east-1.amazonaws.com",
      qHost: "https://q.us-east-1.amazonaws.com",
      limitsPath: "/getUsageLimits",
    },
  },
  oauth: {
    ssoOidcEndpoint: "https://oidc.us-east-1.amazonaws.com",
    registerClientUrl: "https://oidc.us-east-1.amazonaws.com/client/register",
    deviceAuthUrl: "https://oidc.us-east-1.amazonaws.com/device_authorization",
    tokenUrl: "https://oidc.us-east-1.amazonaws.com/token",
    startUrl: "https://view.awsapps.com/start",
    clientName: "kiro-oauth-client",
    clientType: "public",
    scopes: [
      "codewhisperer:completions",
      "codewhisperer:analysis",
      "codewhisperer:conversations",
    ],
    grantTypes: [
      "urn:ietf:params:oauth:grant-type:device_code",
      "refresh_token",
    ],
    authMethods: ["builder-id", "idc", "google", "github", "import"],
  },
  models: [],
  passthroughModels: true,
  features: { usage: true },
};
