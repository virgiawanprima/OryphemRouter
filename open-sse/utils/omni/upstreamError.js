// ADAPTED STUB — OmniRoute `src/shared/utils/upstreamError.ts` normalizes
// upstream error payloads into a JSON error body. Minimal graceful version
// consumed by the image/speech/video combo services.
export function toJsonErrorPayload(error) {
  if (error && typeof error === "object" && (error.error || error.message)) {
    return {
      error: {
        message: error.message ?? error.error?.message ?? String(error),
        ...(error.error && typeof error.error === "object" ? error.error : {}),
      },
    };
  }
  return { error: { message: String(error ?? "Unknown upstream error") } };
}
