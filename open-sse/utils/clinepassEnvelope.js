function unwrapClinepassEnvelope(body, provider) {
  if (provider !== "clinepass") return { body, error: null };
  if (!body || typeof body !== "object" || Array.isArray(body)) return { body, error: null };
  const record = body;
  if (!("success" in record)) return { body, error: null };
  if (record.success === false) {
    const rawError = record.error;
    const message = typeof rawError === "string" ? rawError : (rawError && typeof rawError === "object" ? rawError.message : void 0) || (typeof record.message === "string" ? record.message : void 0) || "Upstream error";
    const statusCode = typeof record.statusCode === "number" ? record.statusCode : null;
    return { body: null, error: { message, status: statusCode } };
  }
  if (record.success === true && "data" in record && record.data !== null && typeof record.data === "object") {
    return { body: record.data, error: null };
  }
  return { body, error: null };
}
export {
  unwrapClinepassEnvelope
};
