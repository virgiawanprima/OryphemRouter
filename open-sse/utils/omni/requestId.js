import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "crypto";
const requestIdStore = new AsyncLocalStorage();
function getHeaderValue(request, name) {
  const value = request?.headers?.get?.(name);
  return typeof value === "string" && value.length > 0 ? value : null;
}
function getRequestId() {
  return requestIdStore.getStore() || null;
}
async function withRequestId(request, handler) {
  const existingId = getHeaderValue(request, "x-request-id");
  const requestId = existingId || randomUUID();
  return requestIdStore.run(requestId, handler);
}
function addRequestIdHeader(headers = {}) {
  const requestId = getRequestId();
  if (requestId) {
    return { ...headers, "x-request-id": requestId };
  }
  return headers;
}
function attachRequestIdToResponse(request, response) {
  const requestId = getRequestId() || getHeaderValue(request, "x-request-id") || randomUUID();
  const headers = new Headers(response.headers);
  headers.set("x-request-id", requestId);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
function generateRequestId() {
  return randomUUID();
}
export {
  addRequestIdHeader,
  attachRequestIdToResponse,
  generateRequestId,
  getRequestId,
  withRequestId
};
