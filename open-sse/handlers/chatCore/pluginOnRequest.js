const JSON_HEADERS = { status: 403, headers: { "Content-Type": "application/json" } };
async function runPluginOnRequestHook(args) {
  try {
    const { runOnRequest } = await import("@/lib/plugins/hooks");
    const pluginCtx = {
      requestId: args.requestId,
      body: args.body,
      model: args.model,
      provider: args.provider,
      apiKeyInfo: args.apiKeyInfo,
      headers: args.headers,
      metadata: {}
    };
    const pluginResult = await runOnRequest(pluginCtx);
    if (pluginResult?.blocked) {
      args.log?.info?.("PLUGIN", `Request blocked by plugin`);
      const response = pluginResult.response ? new Response(JSON.stringify(pluginResult.response), JSON_HEADERS) : new Response(
        JSON.stringify({
          error: { message: "Request blocked by plugin", type: "plugin_block" }
        }),
        JSON_HEADERS
      );
      return { blocked: true, response };
    }
    if (pluginResult?.metadata) {
      Object.assign(pluginCtx.metadata, pluginResult.metadata);
    }
    return { blocked: false, body: pluginResult?.body };
  } catch (pluginErr) {
    args.log?.debug?.(
      "PLUGIN",
      `onRequest hook error (non-fatal): ${pluginErr instanceof Error ? pluginErr.message : String(pluginErr)}`
    );
    return { blocked: false };
  }
}
export {
  runPluginOnRequestHook
};
