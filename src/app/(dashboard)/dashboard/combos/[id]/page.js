"use client";

import { useParams, notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Typography } from "antd";
import { Card, Button, Select, Badge, PageLoading, CapacityBadges, ConfirmModal } from "@/shared/components";
import { useModelCaps } from "@/shared/hooks/useModelCaps";

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Fallback: try in order" },
  { value: "round-robin", label: "Round Robin: rotate" },
  { value: "fusion", label: "Fusion: panel + judge" },
  { value: "pipeline", label: "Pipeline: chain steps" },
  { value: "auto", label: "Auto: AI-ranked (opt-in)" },
];

const KIND_LABELS = {
  llm: "LLM Combo",
  webSearch: "Web Search",
  webFetch: "Web Fetch",
  image: "Text to Image",
  tts: "Text To Speech",
  stt: "Speech To Text",
  video: "Video",
  music: "Music",
  embedding: "Embedding",
};

export default function ComboDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { getCaps, getPricing } = useModelCaps();

  const [combo, setCombo] = useState(null);
  const [strategy, setStrategy] = useState("fallback");
  const [loading, setLoading] = useState(true);
  const [notFoundState, setNotFoundState] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/combos/${id}`, { cache: "no-store" });
        if (res.status === 404) { if (alive) setNotFoundState(true); return; }
        const data = await res.json();
        if (!alive) return;
        setCombo(data);
        const setRes = await fetch("/api/settings", { cache: "no-store" });
        const setData = await setRes.json();
        const st = setData?.comboStrategies?.[data.name]?.fallbackStrategy || "fallback";
        setStrategy(st);
      } catch (e) {
        if (alive) setError(e.message || "Failed to load combo");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id]);

  if (loading) return <PageLoading />;
  if (notFoundState) return notFound();
  if (!combo) return <Card><p className="text-text-muted text-sm">{error || "Combo not found"}</p></Card>;

  const models = Array.isArray(combo.models) ? combo.models : [];
  const kindLabel = KIND_LABELS[combo.kind] || combo.kind || "Combo";

  const saveStrategy = async (value) => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comboStrategies: {
            ...(await fetch("/api/settings", { cache: "no-store" }).then((r) => r.json())).comboStrategies,
            [combo.name]: { fallbackStrategy: value },
          },
        }),
      });
      if (!res.ok) throw new Error("Failed to save strategy");
      setStrategy(value);
    } catch (e) {
      setError(e.message || "Failed to save strategy");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    const res = await fetch(`/api/combos/${combo.id}`, { method: "DELETE" });
    if (res.ok) router.push("/dashboard/combos");
    else setError("Failed to delete combo");
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/dashboard/combos" className="text-[color:var(--md-sys-color-primary)] hover:underline text-sm">
          <span className="material-symbols-outlined text-[18px] align-middle">arrow_back</span> Back to Combos
        </Link>
      </div>

      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Typography.Title level={1} style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>{combo.name}</Typography.Title>
              <Badge>{kindLabel}</Badge>
            </div>
            <p className="text-[13px] text-text-muted">
              {models.length} model{models.length === 1 ? "" : "s"} {combo.kind === "llm" ? "routed in order with fallback" : "in this combo"}
              {combo.contextWindow ? ` · effective context ${combo.contextWindow.toLocaleString()} tokens` : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setConfirmDelete(true)}>
              <span className="material-symbols-outlined text-[16px]">delete</span> Delete
            </Button>
            <Link href="/dashboard/combos">
              <Button variant="primary">
                <span className="material-symbols-outlined text-[16px]">edit</span> Edit
              </Button>
            </Link>
          </div>
        </div>
      </Card>

      {error && <div className="border border-[color:var(--md-sys-color-errorContainer)] bg-[color:var(--md-sys-color-errorContainer)] rounded-[var(--md-sys-shape-corner-large)] p-3 text-[13px] text-[color:var(--md-sys-color-onErrorContainer)]">{error}</div>}

      <Card padding="md">
        <Typography.Title level={2} className="text-[16px] font-medium text-text-main" style={{ margin: 0 }}>Routing strategy</Typography.Title>
        <p className="text-[13px] text-text-muted mb-3">How OryphemRouter chooses among this combo's models on each request.</p>
        <div className="max-w-[320px]">
          <Select
            options={STRATEGY_OPTIONS}
            value={strategy}
            disabled={saving}
            onChange={(v) => saveStrategy(v)}
            selectClassName="py-1.5 text-xs"
          />
        </div>
      </Card>

      <Card padding="md">
        <Typography.Title level={2} className="text-[16px] font-medium text-text-main" style={{ margin: 0 }}>Models</Typography.Title>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {models.length === 0 ? (
            <p className="text-[13px] text-text-muted">No models in this combo yet.</p>
          ) : (
            models.map((m, i) => (
              <div key={m} className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-text-subtle font-mono">{i + 1}</span>
                    <code className="truncate font-mono text-xs text-text-muted">{m}</code>
                  </div>
                  <CapacityBadges caps={getCaps(m)} pricing={getPricing(m)} colorOverride="text-text-muted/70" size={13} />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <ConfirmModal
        isOpen={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={doDelete}
        title="Delete combo"
        message={`Are you sure you want to delete "${combo.name}"? This cannot be undone.`}
        confirmText="Delete"
      />
    </div>
  );
}
