/**
 * Safely parse the JSON body of a Request.
 *
 * Wraps `request.json()` so malformed/empty payloads throw a normalized
 * `Error("Invalid JSON payload")` instead of a raw `SyntaxError`. Route
 * handlers can catch this and return a `400 Bad Request` to the client.
 *
 * @param {Request} request - Next.js/Web Request object exposing `.json()`.
 * @returns {Promise<unknown>} Parsed JSON value.
 * @throws {Error} When the body is not valid JSON.
 */
export async function parseJson(request) {
  try {
    return await request.json();
  } catch {
    throw new Error("Invalid JSON payload");
  }
}
