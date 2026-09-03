// ADAPTED STUB (was services/adobeFireflyClient.ts in OmniRoute).
export class AdobeFireflyError extends Error {
  constructor(message, statusCode = 502) {
    super(message);
    this.name = "AdobeFireflyError";
    this.statusCode = statusCode;
  }
}
export async function resolveAdobeAccessToken() { return null; }
export async function resolveAdobeSourceImageIds() { return []; }
