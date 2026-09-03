import { pipeWithDisconnect as defaultPipeWithDisconnect } from "../../utils/streamHandler.js";
import {
  createSseHeartbeatTransform as defaultHeartbeat,
  shapeForClientFormat as defaultShape
} from "../../utils/sseHeartbeat.js";
import { createModelEchoTransform as defaultModelEcho } from "../../utils/omni/responseModelEcho.js";
import {
  createProgressTransform as defaultProgress,
  wantsProgress as defaultWantsProgress
} from "../../utils/progressTracker.js";
import { createPiiSseTransform as defaultPiiSse } from "../../utils/omni/streamingPiiTransform.js";
import { isFeatureFlagEnabled as defaultFeatureFlag } from "../../utils/omni/featureFlags.js";
import { OMNIROUTE_RESPONSE_HEADERS } from "../../utils/omni/omniHeaders.js";
import { SSE_HEARTBEAT_INTERVAL_MS } from "../../utils/omni/omniConstants.js";
const PIPELINE_START = "omni-pipeline-start";
const PIPELINE_END = "omni-pipeline-end";
const PIPELINE_MEASURE = "omni-pipeline";
const DEFAULT_DEPS = {
  wantsProgress: defaultWantsProgress,
  pipeWithDisconnect: defaultPipeWithDisconnect,
  isFeatureFlagEnabled: defaultFeatureFlag,
  createPiiSseTransform: defaultPiiSse,
  createProgressTransform: defaultProgress,
  createSseHeartbeatTransform: defaultHeartbeat,
  shapeForClientFormat: defaultShape,
  createModelEchoTransform: defaultModelEcho
};
function assembleStreamingPipeline(args, deps = DEFAULT_DEPS) {
  performance.clearMarks(PIPELINE_START);
  performance.clearMarks(PIPELINE_END);
  performance.clearMeasures(PIPELINE_MEASURE);
  performance.mark(PIPELINE_START);
  const progressEnabled = deps.wantsProgress(args.clientRawRequestHeaders);
  let finalStream;
  let piiStream = deps.pipeWithDisconnect(
    args.providerResponse,
    args.transformStream,
    args.streamController
  );
  if (typeof args.createPiiTransform === "function") {
    piiStream = piiStream.pipeThrough(args.createPiiTransform());
  } else if (deps.isFeatureFlagEnabled("PII_RESPONSE_SANITIZATION")) {
    piiStream = piiStream.pipeThrough(deps.createPiiSseTransform());
  }
  if (progressEnabled) {
    const progressTransform = deps.createProgressTransform({
      signal: args.streamController.signal
    });
    finalStream = piiStream.pipeThrough(progressTransform);
    args.responseHeaders[OMNIROUTE_RESPONSE_HEADERS.progress] = "enabled";
  } else {
    finalStream = piiStream;
  }
  finalStream = finalStream.pipeThrough(
    deps.createSseHeartbeatTransform({
      signal: args.streamController.signal,
      intervalMs: SSE_HEARTBEAT_INTERVAL_MS,
      shape: deps.shapeForClientFormat(args.clientResponseFormat)
    })
  );
  if (args.echoModel) {
    finalStream = finalStream.pipeThrough(deps.createModelEchoTransform(args.echoModel));
  }
  performance.mark(PIPELINE_END);
  performance.measure(PIPELINE_MEASURE, PIPELINE_START, PIPELINE_END);
  return finalStream;
}
export {
  assembleStreamingPipeline
};
