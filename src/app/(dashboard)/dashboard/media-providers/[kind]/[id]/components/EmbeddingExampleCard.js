"use client";

import { useState, useEffect } from "react";
import { Card } from "@/shared/components";
import { getProviderAlias, isCustomEmbeddingProvider } from "@/shared/constants/providers";
import { getModelsByProviderId, getModelKind } from "@/shared/constants/models";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { Row } from "./exampleShared";

export function EmbeddingExampleCard({ providerId, customAlias }) {
  const isCustom = isCustomEmbeddingProvider(providerId);
  const providerAlias = isCustom ? (customAlias || providerId) : providerId;
  const embeddingModels = isCustom ? [] : getModelsByProviderId(providerId).filter((m) => getModelKind(m) === "embedding");

  const [selectedModel, setSelectedModel] = useState(embeddingModels[0]?.id ?? "");
  const [input, setInput] = useState("The quick brown fox jumps over the lazy dog");
  const [dimensions, setDimensions] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [useTunnel, setUseTunnel] = useState(false);
  const [localEndpoint, setLocalEndpoint] = useState("");
  const [tunnelEndpoint, setTunnelEndpoint] = useState("");
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const { copied: copiedCurl, copy: copyCurl } = useCopyToClipboard();
  const { copied: copiedRes, copy: copyRes } = useCopyToClipboard();

  useEffect(() => {
    setLocalEndpoint(window.location.origin);
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d) => { setApiKey((d.keys || []).find((k) => k.isActive !== false)?.key || ""); })
      .catch(() => {});
    fetch("/api/tunnel/status")
      .then((r) => r.json())
      .then((d) => { if (d.publicUrl) setTunnelEndpoint(d.publicUrl); })
      .catch(() => {});
  }, []);

  const endpoint = useTunnel ? tunnelEndpoint : localEndpoint;
  const modelFull = selectedModel ? `${providerAlias}/${selectedModel}` : "";

  // Build request body — include dimensions only if user provided a positive number
  const buildBody = () => {
    const body = { model: modelFull, input: input.trim() };
    const dim = Number(dimensions);
    if (dimensions && Number.isFinite(dim) && dim > 0) body.dimensions = dim;
    return body;
  };

  const curlSnippet = `curl -X POST ${endpoint}/v1/embeddings \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${apiKey || "YOUR_KEY"}" \\
  -d '${JSON.stringify(buildBody())}'`;

  const handleRun = async () => {
    if (!input.trim() || !modelFull) return;
    setRunning(true);
    setError("");
    setResult(null);
    const start = Date.now();
    try {
      const headers = { "Content-Type": "application/json" };
      if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
      const res = await fetch("/api/v1/embeddings", {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody()),
      });
      const latencyMs = Date.now() - start;
      const data = await res.json();
      if (!res.ok) { setError(data?.error?.message || data?.error || `HTTP ${res.status}`); return; }
      setResult({ data, latencyMs });
    } catch (e) {
      setError(e.message || "Network error");
    } finally {
      setRunning(false);
    }
  };

  // Raw payload kept only for the explicit Copy action (not shown in the UI)
  const resultJson = result ? JSON.stringify(result.data, null, 2) : "";

  return (
    <Card>
      <h2 className="text-lg font-semibold mb-4">Example</h2>

      <div className="flex flex-col gap-2.5">
        {/* Model — text input for custom node, dropdown otherwise */}
        <Row label="Model">
          {isCustom ? (
            <input
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              placeholder="e.g. voyage-3, embed-english-v3.0, text-embedding-3-small"
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
            />
          ) : (
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            >
              {embeddingModels.map((m) => (
                <option key={m.id} value={m.id}>{m.name || m.id}</option>
              ))}
            </select>
          )}
        </Row>

        {/* Endpoint */}
        <Row label="Endpoint">
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
            <input
              value={endpoint}
              onChange={(e) => useTunnel ? setTunnelEndpoint(e.target.value) : setLocalEndpoint(e.target.value)}
              className="w-full min-w-0 flex-1 px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
              placeholder="http://localhost:3000"
            />
            {/* Tunnel toggle — only show if tunnel URL is available */}
            {tunnelEndpoint && (
              <button
                onClick={() => setUseTunnel((v) => !v)}
                title={useTunnel ? "Using tunnel" : "Using local"}
                className={`flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border shrink-0 transition-colors ${
                  useTunnel ? "border-primary/40 bg-primary/10 text-primary" : "border-border text-text-muted hover:text-primary"
                }`}
              >
                <span className="material-symbols-outlined text-[14px]">wifi_tethering</span>
                Tunnel
              </button>
            )}
          </div>
        </Row>

        {/* API Key */}
        <Row label="API Key">
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary font-mono"
          />
        </Row>

        {/* Input */}
        <Row label="Input">
          <div className="relative">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full px-3 py-1.5 pr-7 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
            />
            {input && (
              <button
                type="button"
                onClick={() => setInput("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">close</span>
              </button>
            )}
          </div>
        </Row>

        {/* Dimensions (optional) — truncate embedding vector length */}
        <Row label="Dimensions">
          <input
            type="number"
            min="1"
            value={dimensions}
            onChange={(e) => setDimensions(e.target.value)}
            placeholder="optional, e.g. 512, 1024 (leave empty for default)"
            className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:outline-none focus:border-primary"
          />
        </Row>

        {/* Curl + Run */}
        <div className="mt-1">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">Request</span>
            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
              <button
                onClick={() => copyCurl(curlSnippet)}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">{copiedCurl ? "check" : "content_copy"}</span>
                {copiedCurl ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleRun}
                disabled={running || !input.trim() || !modelFull}
                className="flex w-full sm:w-auto items-center justify-center gap-1.5 px-3 py-1 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <span className="material-symbols-outlined text-[14px]" style={running ? { animation: "spin 1s linear infinite" } : undefined}>
                  play_arrow
                </span>
                {running ? "Running..." : "Run"}
              </button>
            </div>
          </div>
          <pre className="bg-sidebar rounded-lg px-3 py-2.5 text-xs font-mono text-text-main overflow-x-auto whitespace-pre-wrap break-all">{curlSnippet}</pre>
        </div>

        {/* Error */}
        {error && <p className="text-xs text-red-500 break-words">{error}</p>}

        {/* Response — formatted result (no raw JSON), default example or real result */}
        <div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-1.5">
            <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
              Response {result && <span className="font-normal normal-case">&#9889; {result.latencyMs}ms</span>}
            </span>
            {result && (
              <button
                onClick={() => copyRes(resultJson)}
                className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-[14px]">{copiedRes ? "check" : "content_copy"}</span>
                {copiedRes ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          {result ? (
            <EmbeddingResultView data={result.data} />
          ) : (
            <p className="bg-sidebar rounded-lg px-3 py-2.5 text-xs text-text-muted">
              Run the request to see the embedding dimensions and a vector preview.
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// Formatted embedding result — shows model, dimensions, usage and a vector
// preview as UI chips instead of a raw JSON block.
function EmbeddingResultView({ data }) {
  const items = Array.isArray(data?.data) ? data.data : [];
  const embedding = items[0]?.embedding;
  const dims = Array.isArray(embedding) ? embedding.length : null;
  const preview = Array.isArray(embedding) ? embedding.slice(0, 6).map((v) => (typeof v === "number" ? v.toFixed(6) : String(v))) : [];
  const usage = data?.usage || {};
  const badge = "px-1.5 py-0.5 rounded bg-bg-subtle border border-border text-[10px] font-medium text-text-muted";

  return (
    <div className="bg-sidebar rounded-lg px-3 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        <span className={badge}>{data?.model || "embedding"}</span>
        {dims != null && <span className={badge}>{dims} dims</span>}
        {typeof usage.prompt_tokens === "number" && <span className={badge}>{usage.prompt_tokens} prompt tokens</span>}
        {typeof usage.total_tokens === "number" && <span className={badge}>{usage.total_tokens} total tokens</span>}
      </div>
      {preview.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {preview.map((v, i) => (
            <code key={i} className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[11px] text-text-main dark:bg-white/5">
              {v}
            </code>
          ))}
          {dims != null && preview.length < dims && (
            <span className="text-text-muted">… {dims - preview.length} more</span>
          )}
        </div>
      )}
    </div>
  );
}
