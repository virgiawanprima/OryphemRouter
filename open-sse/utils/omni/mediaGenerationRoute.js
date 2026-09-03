// ADAPTED STUB — OmniRoute `src/app/api/v1/_shared/mediaGenerationRoute.ts`
// provides shared media-generation response helpers. Minimal versions of the
// three helpers consumed by videoCombo (direct-route parity for combo video).
import { errorResponse } from "../errorSanitize.js";

export function isMediaGenerationFailure(result) {
  return (
    !!result &&
    result.success === false &&
    "error" in result &&
    typeof result.status === "number"
  );
}

export function promptRequiredResponse(body) {
  if (typeof body?.prompt === "string" && body.prompt.trim().length > 0) {
    return null;
  }
  return errorResponse(400, "Prompt is required");
}

export async function successfulMediaGenerationResponse({
  result,
  provider,
  model,
  startTime,
  strategy,
  fallbackAttempts,
}) {
  const data = result?.data ?? result ?? {};
  const headers = new Headers({ "Content-Type": "application/json" });
  if (provider) headers.set("x-omniroute-provider", String(provider));
  if (model) headers.set("x-omniroute-model", String(model));
  if (strategy) headers.set("x-omniroute-strategy", String(strategy));
  if (fallbackAttempts !== undefined) {
    headers.set("x-omniroute-fallback-attempts", String(fallbackAttempts));
  }
  if (typeof startTime === "number") {
    headers.set("x-omniroute-latency-ms", String(Date.now() - startTime));
  }
  return new Response(JSON.stringify(data), {
    status: 200,
    headers,
  });
}
