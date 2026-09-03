function toRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
async function submitComfyWorkflow(baseUrl, workflow) {
  const res = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt: workflow })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ComfyUI submit failed (${res.status}): ${errText}`);
  }
  const data = toRecord(await res.json());
  const promptId = data.prompt_id;
  if (typeof promptId !== "string" || !promptId) {
    throw new Error("ComfyUI submit failed: missing prompt_id");
  }
  return promptId;
}
async function pollComfyResult(baseUrl, promptId, timeoutMs = 12e4) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2e3));
    const res = await fetch(`${baseUrl}/history/${promptId}`);
    if (!res.ok) continue;
    const data = toRecord(await res.json());
    const entry = toRecord(data[promptId]);
    if (entry && entry.outputs && Object.keys(entry.outputs).length > 0) {
      return entry;
    }
  }
  throw new Error(`ComfyUI prompt ${promptId} timed out after ${timeoutMs}ms`);
}
async function fetchComfyOutput(baseUrl, filename, subfolder, type) {
  const url = new URL(`${baseUrl}/view`);
  url.searchParams.set("filename", filename);
  url.searchParams.set("subfolder", subfolder);
  url.searchParams.set("type", type);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`ComfyUI fetch output failed (${res.status})`);
  }
  return res.arrayBuffer();
}
function extractComfyOutputFiles(historyEntry) {
  const files = [];
  for (const nodeOutput of Object.values(historyEntry.outputs || {})) {
    const outputs = nodeOutput.images || nodeOutput.gifs || nodeOutput.audio || [];
    for (const file of outputs) {
      files.push({
        filename: file.filename,
        subfolder: file.subfolder || "",
        type: file.type || "output"
      });
    }
  }
  return files;
}
function resolveComfyUiBaseUrl(credentials, fallback) {
  const psd = credentials?.providerSpecificData;
  const override = psd && typeof psd === "object" && typeof psd.baseUrl === "string" && psd.baseUrl.trim() ? psd.baseUrl.trim() : null;
  return override || fallback;
}
export {
  extractComfyOutputFiles,
  fetchComfyOutput,
  pollComfyResult,
  resolveComfyUiBaseUrl,
  submitComfyWorkflow
};
