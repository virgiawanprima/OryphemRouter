// ADAPTED — graceful fallback (was @/lib/streamingPiiTransform).
// Pass-through transform that does no PII sanitization.
export function createPiiSseTransform() {
  return new TransformStream({
    transform(chunk, controller) {
      controller.enqueue(chunk);
    },
  });
}