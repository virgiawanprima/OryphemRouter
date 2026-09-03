function buildNonStreamingJsonResponse(body, headers) {
  const payload = JSON.stringify(body);
  return new Response(payload, {
    headers: {
      ...headers,
      "Content-Length": String(Buffer.byteLength(payload))
    }
  });
}
export {
  buildNonStreamingJsonResponse
};
