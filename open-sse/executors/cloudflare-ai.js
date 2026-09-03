import { BaseExecutor } from "./base.js";
import { PROVIDERS } from "./executorConstants.js";
class CloudflareAIExecutor extends BaseExecutor {
  constructor() {
    super("cloudflare-ai", PROVIDERS["cloudflare-ai"] || { format: "openai" });
  }
  buildUrl(_model, _stream, _urlIndex = 0, credentials = null) {
    const accountId = credentials?.providerSpecificData?.accountId || credentials?.accountId || process.env.CLOUDFLARE_ACCOUNT_ID;
    if (!accountId) {
      throw new Error(
        "Cloudflare Workers AI requires an Account ID. Add it in provider settings under 'Account ID'. Find it at: https://dash.cloudflare.com (right sidebar)."
      );
    }
    return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
  }
  buildHeaders(credentials, stream = true) {
    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${credentials.apiKey || credentials.accessToken}`
    };
    if (stream) {
      headers["Accept"] = "text/event-stream";
    }
    return headers;
  }
  transformRequest(_model, body, _stream, _credentials) {
    if (!Array.isArray(body.messages)) return body;
    const flattenContent = (content) => {
      if (typeof content === "string" || !Array.isArray(content)) return content;
      return content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const p = part;
        if (p.type === "text" && typeof p.text === "string") return p.text;
        throw new Error(
          `Cloudflare Workers AI chat endpoint does not accept image/non-text content parts (got type "${typeof p.type === "string" ? p.type : "unknown"}"). Remove image/file attachments or route this request to a vision-capable provider.`
        );
      }).join("");
    };
    const messages = body.messages.map(
      (msg) => msg && Array.isArray(msg.content) ? { ...msg, content: flattenContent(msg.content) } : msg
    );
    return { ...body, messages };
  }
  async execute(input) {
    try {
      return await super.execute(input);
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
        transformedBody: input?.body ?? {}
      };
    }
  }
}
var cloudflare_ai_default = CloudflareAIExecutor;
export {
  CloudflareAIExecutor,
  cloudflare_ai_default as default
};
