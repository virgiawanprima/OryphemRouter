async function runPluginOnResponseHook(args) {
  try {
    const { runOnResponse } = await import("@/lib/plugins/hooks");
    runOnResponse(
      {
        requestId: args.requestId,
        body: args.body,
        model: args.model,
        provider: args.provider,
        apiKeyInfo: args.apiKeyInfo,
        headers: args.headers,
        metadata: {}
      },
      args.response
    ).catch(() => {
    });
  } catch (_) {
  }
}
async function runPluginOnStreamCompleteHook(args) {
  try {
    const { runOnStreamComplete } = await import("@/lib/plugins/hooks");
    runOnStreamComplete({
      status: args.status,
      usage: args.usage,
      timing: {
        latencyMs: Date.now() - args.startTime,
        ttft: args.ttft
      },
      model: args.model ?? void 0,
      provider: args.provider ?? void 0,
      errorCode: args.errorCode ?? void 0
    }).catch(() => {
    });
  } catch (_) {
  }
}
export {
  runPluginOnResponseHook,
  runPluginOnStreamCompleteHook
};
