import { GithubExecutor } from "./github.js";
import { getModelTargetFormat } from "../config/providerModels.js";
class GheCopilotExecutor extends GithubExecutor {
  constructor(config) {
    super("ghe-copilot", {
      format: "openai",
      baseUrl: "https://api.githubcopilot.com/chat/completions",
      responsesBaseUrl: "https://api.githubcopilot.com/responses",
      // Static default only; the executor's getMessagesBase() derives the real
      // per-connection host from copilotApiUrl/gheUrl at request time. Its
      // presence enables Claude -> /v1/messages routing in the buildUrl override.
      messagesUrl: "https://api.githubcopilot.com/v1/messages",
      authType: "oauth",
      authHeader: "bearer",
      ...config
    });
  }
  /**
   * Derive the base URL for chat/completions from gheUrl in providerSpecificData.
   * Appends /chat/completions if not already present.
   */
  getChatCompletionsBase(credentials) {
    const psd = credentials?.providerSpecificData;
    const apiOrProxy = (typeof psd?.copilotApiUrl === "string" ? psd.copilotApiUrl : void 0) || (typeof psd?.copilotProxyUrl === "string" ? psd.copilotProxyUrl : void 0);
    if (apiOrProxy) {
      const base2 = apiOrProxy.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "").replace(/\/+$/, "");
      return base2.endsWith("/chat/completions") ? base2 : `${base2}/chat/completions`;
    }
    const gheUrl = psd?.gheUrl;
    if (!gheUrl) {
      throw new Error("GHE Copilot executor requires gheUrl in providerSpecificData");
    }
    const base = gheUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "").replace(/\/+$/, "");
    return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  }
  /**
   * Derive the base URL for /responses from gheUrl in providerSpecificData.
   * Appends /responses if not already present.
   */
  getResponsesBase(credentials) {
    const psd = credentials?.providerSpecificData;
    const apiOrProxy = (typeof psd?.copilotApiUrl === "string" ? psd.copilotApiUrl : void 0) || (typeof psd?.copilotProxyUrl === "string" ? psd.copilotProxyUrl : void 0);
    if (apiOrProxy) {
      const base2 = apiOrProxy.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "").replace(/\/+$/, "");
      return `${base2}/responses`;
    }
    const gheUrl = psd?.gheUrl;
    if (!gheUrl) {
      throw new Error("GHE Copilot executor requires gheUrl in providerSpecificData");
    }
    const base = gheUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "").replace(/\/+$/, "");
    return `${base}/responses`;
  }
  /**
   * Derive the base URL for the Anthropic-native /v1/messages shim from the GHE
   * host in providerSpecificData. Claude models use this endpoint (prompt-cache
   * token counts + lossless tool_use/tool_result/thinking blocks) rather than
   * the OpenAI-shaped /chat/completions. Appends /v1/messages if not present.
   */
  getMessagesBase(credentials) {
    const psd = credentials?.providerSpecificData;
    const apiOrProxy = (typeof psd?.copilotApiUrl === "string" ? psd.copilotApiUrl : void 0) || (typeof psd?.copilotProxyUrl === "string" ? psd.copilotProxyUrl : void 0);
    const host = apiOrProxy || psd?.gheUrl;
    if (!host) {
      throw new Error("GHE Copilot executor requires copilotApiUrl or gheUrl in providerSpecificData");
    }
    const base = host.replace(/\/v1\/messages\/?$/, "").replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "").replace(/\/+$/, "");
    return `${base}/v1/messages`;
  }
  /**
   * Strip the `ghe-copilot/` provider prefix from a model id so the upstream
   * GHE Copilot proxy receives the bare id (e.g. `gpt-5-mini`).
   */
  stripPrefix(model) {
    return typeof model === "string" && model.startsWith("ghe-copilot/") ? model.slice("ghe-copilot/".length) : model;
  }
  buildUrl(model, stream, urlIndex = 0, credentials = null) {
    const bareModel = this.stripPrefix(model);
    const targetFormat = getModelTargetFormat("ghe-copilot", bareModel);
    if ((targetFormat === "claude" || /claude/i.test(bareModel)) && this.config.messagesUrl) {
      return this.getMessagesBase(credentials);
    }
    if ((targetFormat === "openai-responses" || /codex/i.test(bareModel)) && this.supportsResponsesEndpoint(bareModel)) {
      return this.getResponsesBase(credentials);
    }
    return this.getChatCompletionsBase(credentials);
  }
  /**
   * Strip the `ghe-copilot/` provider prefix from the model before sending to
   * the upstream GHE Copilot proxy, which expects bare model ids.
   */
  transformRequest(model, body, stream, credentials) {
    const bareModel = this.stripPrefix(model);
    const transformed = super.transformRequest(bareModel, body, stream, credentials);
    if (transformed && typeof transformed === "object") {
      const record = transformed;
      if (typeof record.model === "string") {
        record.model = this.stripPrefix(record.model);
      }
      record.stream = true;
    }
    return transformed;
  }
  async refreshCopilotToken(githubAccessToken, log, credentials) {
    const gheUrl = credentials?.providerSpecificData?.gheUrl;
    if (!gheUrl) return null;
    try {
      const baseUrl = gheUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "");
      const tokenUrl = `${baseUrl}/api/v3/copilot_internal/v2/token`;
      const response = await fetch(tokenUrl, {
        headers: {
          Authorization: `Bearer ${githubAccessToken}`,
          Accept: "application/json"
        }
      });
      if (!response.ok) return null;
      const data = await response.json();
      log?.info?.("TOKEN", "GHE Copilot token refreshed");
      const endpoints = data.endpoints ? { proxy: data.endpoints.proxy, api: data.endpoints.api } : void 0;
      return {
        token: data.token,
        expiresAt: data.expires_at,
        ...endpoints ? { endpoints } : {}
      };
    } catch (error) {
      log?.error?.("TOKEN", `GHE Copilot refresh error: ${error.message}`);
      return null;
    }
  }
  async refreshGitHubToken(refreshToken, log, credentials) {
    const gheUrl = credentials?.providerSpecificData?.gheUrl;
    if (!gheUrl) return null;
    try {
      const baseUrl = gheUrl.replace(/\/chat\/completions\/?$/, "").replace(/\/responses\/?$/, "");
      const tokenUrl = `${baseUrl}/login/oauth/access_token`;
      const params = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId
      });
      if (this.config.clientSecret) {
        params.set("client_secret", this.config.clientSecret);
      }
      const response = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: params
      });
      if (!response.ok) return null;
      const tokens = await response.json();
      log?.info?.("TOKEN", "GHE GitHub token refreshed");
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken,
        expiresIn: tokens.expires_in
      };
    } catch (error) {
      log?.error?.("TOKEN", `GHE GitHub refresh error: ${error.message}`);
      return null;
    }
  }
  /**
   * Merge a fresh Copilot token result into providerSpecificData, preserving
   * existing fields and updating the token/expiry/endpoint bookkeeping GHE
   * Copilot needs (copilotApiUrl for chat/models, copilotProxyUrl legacy
   * fallback, gheUrl for the next refresh round-trip).
   */
  buildRefreshedProviderSpecificData(credentials, copilotResult) {
    return {
      ...credentials?.providerSpecificData,
      copilotToken: copilotResult.token,
      copilotTokenExpiresAt: copilotResult.expiresAt,
      copilotApiUrl: copilotResult.endpoints?.api,
      copilotProxyUrl: copilotResult.endpoints?.proxy,
      gheUrl: credentials?.providerSpecificData?.gheUrl
    };
  }
  /**
   * Fallback path when the cached GitHub access token can no longer mint a
   * Copilot token directly: refresh the GitHub OAuth token first, then retry
   * the Copilot token exchange with the new access token.
   */
  async refreshViaGitHubToken(credentials, log) {
    const githubTokens = await this.refreshGitHubToken(
      credentials.refreshToken,
      log,
      credentials
    );
    if (!githubTokens?.accessToken) return null;
    const copilotResult = await this.refreshCopilotToken(githubTokens.accessToken, log, credentials);
    if (!copilotResult) return githubTokens;
    return {
      ...githubTokens,
      copilotToken: copilotResult.token,
      copilotTokenExpiresAt: copilotResult.expiresAt,
      providerSpecificData: this.buildRefreshedProviderSpecificData(credentials, copilotResult)
    };
  }
  /**
   * Refresh credentials and capture the GHE Copilot proxy URL (endpoints.proxy)
   * returned by the token endpoint, storing it in providerSpecificData so
   * buildUrl routes chat/responses traffic to the correct enterprise host.
   */
  async refreshCredentials(credentials, log) {
    const copilotResult = await this.refreshCopilotToken(credentials?.accessToken, log, credentials);
    if (!copilotResult && credentials?.refreshToken) {
      return this.refreshViaGitHubToken(credentials, log);
    }
    if (copilotResult) {
      return {
        accessToken: credentials?.accessToken,
        refreshToken: credentials?.refreshToken,
        copilotToken: copilotResult.token,
        copilotTokenExpiresAt: copilotResult.expiresAt,
        providerSpecificData: this.buildRefreshedProviderSpecificData(credentials, copilotResult)
      };
    }
    return null;
  }
  async execute(options) {
    try {
      return await super.execute(options);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        response: new Response(
          JSON.stringify({
            error: { message, type: "configuration_error", code: "" }
          }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        ),
        url: "",
        headers: {},
        transformedBody: options?.body ?? {}
      };
    }
  }
}
var ghe_copilot_default = GheCopilotExecutor;
export {
  GheCopilotExecutor,
  ghe_copilot_default as default
};
