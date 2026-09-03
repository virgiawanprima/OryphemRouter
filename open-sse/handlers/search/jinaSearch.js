function buildJinaSearchRequest(config, params) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json"
  };
  if (params.token) {
    headers.Authorization = `Bearer ${params.token}`;
  }
  const body = {
    q: params.query,
    num: params.maxResults
  };
  if (params.country) body.gl = params.country;
  if (params.language) body.hl = params.language;
  if (typeof params.offset === "number" && params.offset > 0) {
    body.page = params.offset;
  }
  return {
    url: config.baseUrl.endsWith("/") ? config.baseUrl : `${config.baseUrl}/`,
    init: {
      method: "POST",
      headers,
      body: JSON.stringify(body)
    }
  };
}
function extractJinaSearchItems(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const record = data;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.results)) return record.results;
  }
  return [];
}
export {
  buildJinaSearchRequest,
  extractJinaSearchItems
};
