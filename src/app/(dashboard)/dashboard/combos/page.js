"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Card, Button, Modal, Input, CardSkeleton, ModelSelectModal, ConfirmModal, CapacityBadges, Select, Toggle } from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import { useModelCaps } from "@/shared/hooks/useModelCaps";
import { useLiveRefresh } from "@/shared/hooks/useRealtime";

// Validate combo name: only a-z, A-Z, 0-9, -, _
const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Capacity adapter: global fallback pools of models per input-modality capability.
// A request needing a capability the target model/combo lacks switches straight
// to the first enabled model here instead of erroring or dropping the data.
const CAPACITY_ADAPTER_CAPS = [
  { key: "vision", label: "Vision", icon: "visibility", desc: "Images" },
  // pdf, videoInput temporarily hidden — no translator support yet for those blocks.
  { key: "audioInput", label: "Audio", icon: "graphic_eq", desc: "Audio input" },
];
const EMPTY_CAP_ENTRY = { enabled: true, roundRobin: false, models: [] };
const EMPTY_CAPACITY_ADAPTER = {
  vision: { ...EMPTY_CAP_ENTRY },
  pdf: { ...EMPTY_CAP_ENTRY },
  audioInput: { ...EMPTY_CAP_ENTRY },
  videoInput: { ...EMPTY_CAP_ENTRY },
};
// Backward-compat: legacy stored form was an array of {model, enabled}.
function normalizeCapEntry(entry) {
  if (Array.isArray(entry)) {
    return { enabled: true, roundRobin: false, models: entry.map((e) => e?.model || e).filter(Boolean) };
  }
  if (entry && typeof entry === "object") {
    return {
      enabled: entry.enabled !== false,
      roundRobin: !!entry.roundRobin,
      models: Array.isArray(entry.models) ? entry.models.filter(Boolean) : [],
    };
  }
  return { ...EMPTY_CAP_ENTRY };
}

export default function CombosPage() {
  const [combos, setCombos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [activeProviders, setActiveProviders] = useState([]);
  const [comboStrategies, setComboStrategies] = useState({});
  const [capacityAdapter, setCapacityAdapter] = useState(EMPTY_CAPACITY_ADAPTER);
  const { getCaps, getPricing } = useModelCaps();
  const [confirmState, setConfirmState] = useState(null);
  const { copied, copy } = useCopyToClipboard();

  const fetchData = async () => {
    try {
      const [combosRes, providersRes, settingsRes] = await Promise.all([
        fetch("/api/combos"),
        fetch("/api/providers"),
        fetch("/api/settings"),
      ]);
      const combosData = await combosRes.json();
      const providersData = await providersRes.json();
      const settingsData = settingsRes.ok ? await settingsRes.json() : {};
      
      // Only LLM combos here - webSearch/webFetch combos belong to media-providers/web
      if (combosRes.ok) setCombos((combosData.combos || []).filter(c => !c.kind || c.kind === "llm"));
      if (providersRes.ok) {
        setActiveProviders(providersData.connections || []);
      }
      setComboStrategies(settingsData.comboStrategies || {});
      const rawAdapter = settingsData.capacityAdapter || {};
      const normalized = {};
      for (const cap of CAPACITY_ADAPTER_CAPS) {
        normalized[cap.key] = normalizeCapEntry(rawAdapter[cap.key]);
      }
      setCapacityAdapter(normalized);
    } catch (error) {
      console.log("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);  

  // Live push-driven refresh — no fixed-interval polling
  useLiveRefresh(fetchData);

  const handleSetCapacityAdapter = async (next) => {
    setCapacityAdapter(next);
    try {
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ capacityAdapter: next }),
      });
    } catch (error) {
      console.log("Error updating capacity adapter:", error);
    }
  };

  const handleCreate = async (data) => {
    try {
      const res = await fetch("/api/combos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setShowCreateModal(false);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to create combo");
      }
    } catch (error) {
      console.log("Error creating combo:", error);
    }
  };

  const handleUpdate = async (id, data) => {
    try {
      const res = await fetch(`/api/combos/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        await fetchData();
        setEditingCombo(null);
      } else {
        const err = await res.json();
        alert(err.error || "Failed to update combo");
      }
    } catch (error) {
      console.log("Error updating combo:", error);
    }
  };

  const handleDelete = async (id) => {
    setConfirmState({
      title: "Delete Combo",
      message: "Delete this combo?",
      onConfirm: async () => {
        setConfirmState(null);
        try {
          const res = await fetch(`/api/combos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setCombos(combos.filter(c => c.id !== id));
          }
        } catch (error) {
          console.log("Error deleting combo:", error);
        }
      }
    });
  };

  // Merge a per-combo strategy patch into settings.comboStrategies. Passing an empty
  // patch (strategy back to default "fallback") drops the entry entirely.
  const handleSetComboStrategy = async (comboName, patch) => {
    try {
      const updated = { ...comboStrategies };
      const next = { ...(updated[comboName] || {}), ...patch };
      // Prune to keep settings clean: default fallback with no extras = no entry.
      if (!next.fallbackStrategy || next.fallbackStrategy === "fallback") {
        delete updated[comboName];
      } else {
        updated[comboName] = next;
      }

      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comboStrategies: updated }),
      });

      setComboStrategies(updated);
    } catch (error) {
      console.log("Error updating combo strategy:", error);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm text-text-muted mt-1">
            Group models under one name, then pick a strategy per combo:
          </p>
          <ul className="text-sm text-text-muted mt-2 flex flex-col gap-1">
            <li><span className="font-medium text-text-main">Fallback</span>: tries models in order (next on failure)</li>
            <li><span className="font-medium text-text-main">Round Robin</span>: rotates models across requests to spread load</li>
            <li><span className="font-medium text-text-main">Fusion</span>: queries all models in parallel, then a judge synthesizes one answer. Best quality, but costs the most: every request bills all panel models + the judge (N+1 calls)</li>
          </ul>
        </div>
        <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto whitespace-nowrap">
          Create Combo
        </Button>
      </div>

      {/* Combos List */}
      {combos.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 text-primary mb-4">
              <span className="material-symbols-outlined text-[32px]">layers</span>
            </div>
            <p className="text-text-main font-medium mb-1">No combos yet</p>
            <p className="text-sm text-text-muted mb-4">Create model combos with fallback support</p>
            <Button icon="add" onClick={() => setShowCreateModal(true)} className="w-full sm:w-auto">
              Create Combo
            </Button>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {combos.map((combo) => (
            <ComboCard
              key={combo.id}
              combo={combo}
              getCaps={getCaps} getPricing={getPricing}
              activeProviders={activeProviders}
              copied={copied}
              onCopy={copy}
              onEdit={() => setEditingCombo(combo)}
              onDelete={() => handleDelete(combo.id)}
              strategy={comboStrategies[combo.name] || {}}
              onSetStrategy={(patch) => handleSetComboStrategy(combo.name, patch)}
            />
          ))}
        </div>
      )}

      {/* Capacity Adapter */}
      <CapacityAdapterSection
        capacityAdapter={capacityAdapter}
        onChange={handleSetCapacityAdapter}
        activeProviders={activeProviders}
        getCaps={getCaps} getPricing={getPricing}
      />

      {/* Create Modal - Use key to force remount and reset state */}
      {showCreateModal && (
        <ComboFormModal
          key="create"
          isOpen={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreate}
          activeProviders={activeProviders}
        />
      )}

      {editingCombo && (
        <ComboFormModal
          key={editingCombo.id}
          isOpen={!!editingCombo}
          combo={editingCombo}
          onClose={() => setEditingCombo(null)}
          onSave={(data) => handleUpdate(editingCombo.id, data)}
          activeProviders={activeProviders}
        />
      )}

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={!!confirmState}
        onClose={() => setConfirmState(null)}
        onConfirm={confirmState?.onConfirm}
        title={confirmState?.title || "Confirm"}
        message={confirmState?.message}
        variant="danger"
      />
    </div>
  );
}

const STRATEGY_OPTIONS = [
  { value: "fallback", label: "Fallback: try in order" },
  { value: "round-robin", label: "Round Robin: rotate" },
  { value: "fusion", label: "Fusion: panel + judge" },
  { value: "pipeline", label: "Pipeline: chain steps" },
  { value: "auto", label: "Auto: AI-ranked (opt-in)" },
];

function ComboCard({ combo, getCaps, getPricing, activeProviders = [], copied, onCopy, onEdit, onDelete, strategy = {}, onSetStrategy }) {
  const [showJudgeSelect, setShowJudgeSelect] = useState(false);
  const current = strategy.fallbackStrategy || "fallback";
  const judge = strategy.judgeModel || "";
  const isFusion = current === "fusion";

  return (
    <Card padding="sm" className="group">
      <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-primary text-[18px]">layers</span>
          </div>
          <div className="min-w-0 flex-1">
            <Link href={`/dashboard/combos/${combo.id}`} className="block">
              <code className="block truncate font-mono text-sm font-medium hover:text-primary transition-colors">{combo.name}</code>
            </Link>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1">
              {combo.models.length === 0 ? (
                <span className="text-xs text-text-muted italic">No models</span>
              ) : (
                combo.models.slice(0, 3).map((model, index) => (
                  <code key={index} className="inline-flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 font-mono text-xs text-text-muted dark:bg-white/5">
                    <span>{model}</span>
                    <CapacityBadges caps={getCaps?.(model)} pricing={getPricing?.(model)} />
                  </code>
                ))
              )}
              {combo.models.length > 3 && (
                <span className="text-[10px] text-text-muted">+{combo.models.length - 3} more</span>
              )}
            </div>
            {/* Fusion: judge picker (Auto = first model) */}
            {isFusion && (
              <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-medium text-text-muted">Judge</span>
                <button
                  onClick={() => setShowJudgeSelect(true)}
                  className="inline-flex max-w-full items-center gap-1 rounded border border-dashed border-primary/40 px-1.5 py-0.5 font-mono text-[11px] text-primary hover:border-primary hover:bg-primary/5 transition-colors"
                  title="Pick the model that fuses panel answers"
                >
                  <span className="material-symbols-outlined text-[13px]">gavel</span>
                  <span className="truncate">{judge || `Auto: ${combo.models[0] || "first model"}`}</span>
                </button>
                {judge && (
                  <button
                    onClick={() => onSetStrategy({ judgeModel: "" })}
                    className="p-0.5 rounded text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    title="Reset judge to Auto"
                  >
                    <span className="material-symbols-outlined text-[13px]">close</span>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3 sm:shrink-0">
          {/* Strategy selector — always visible */}
          <div className="w-full sm:w-[200px]">
            <Select
              options={STRATEGY_OPTIONS}
              value={current}
              onChange={(e) => onSetStrategy({ fallbackStrategy: e.target.value })}
              selectClassName="py-1.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-3 gap-1 sm:flex">
            <button
              onClick={(e) => { e.stopPropagation(); onCopy(combo.name, `combo-${combo.id}`); }}
              className="flex flex-col items-center rounded px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Copy combo name"
            >
              <span className="material-symbols-outlined text-[18px]">
                {copied === `combo-${combo.id}` ? "check" : "content_copy"}
              </span>
              <span className="text-[10px] leading-tight">Copy</span>
            </button>
            <button
              onClick={onEdit}
              className="flex flex-col items-center rounded px-2 py-1 text-text-muted transition-colors hover:bg-black/5 hover:text-primary dark:hover:bg-white/5"
              title="Edit"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              <span className="text-[10px] leading-tight">Edit</span>
            </button>
            <button
              onClick={onDelete}
              className="flex flex-col items-center rounded px-2 py-1 text-red-500 transition-colors hover:bg-red-500/10"
              title="Delete"
            >
              <span className="material-symbols-outlined text-[18px]">delete</span>
              <span className="text-[10px] leading-tight">Delete</span>
            </button>
          </div>
        </div>
      </div>

      {/* Judge model picker (single-select; combo members make natural judges too) */}
      {showJudgeSelect && (
        <ModelSelectModal
          isOpen={showJudgeSelect}
          onClose={() => setShowJudgeSelect(false)}
          onSelect={(m) => { onSetStrategy({ judgeModel: m?.value || "" }); setShowJudgeSelect(false); }}
          activeProviders={activeProviders}
          title="Select Judge Model"
          addedModelValues={judge ? [judge] : []}
          closeOnSelect={true}
        />
      )}
    </Card>
  );
}

function CapacityAdapterSection({ capacityAdapter, onChange, activeProviders, getCaps, getPricing }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium">Vision Adapter</p>
          <p className="text-xs text-text-muted mt-0.5">
            Your model can&apos;t read image/audio? Auto-switches to a model in the pool below.
          </p>
          <ul className="mt-1.5 text-[11px] text-text-muted flex flex-col gap-0.5">
            <li><span className="font-medium text-text-main">Vision</span>: images (png, jpg, webp, …)</li>
            <li><span className="font-medium text-text-main">Audio</span>: audio input</li>
          </ul>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        {CAPACITY_ADAPTER_CAPS.map((cap) => (
          <CapacityAdapterCap
            key={cap.key}
            cap={cap}
            entry={capacityAdapter[cap.key] || EMPTY_CAP_ENTRY}
            onChange={(entry) => onChange({ ...capacityAdapter, [cap.key]: entry })}
            activeProviders={activeProviders}
            getCaps={getCaps} getPricing={getPricing}
          />
        ))}
      </div>
    </div>
  );
}

function CapacityAdapterCap({ cap, entry, onChange, activeProviders, getCaps, getPricing }) {
  const [showModelSelect, setShowModelSelect] = useState(false);
  const { enabled, roundRobin, models } = entry;

  const patch = (p) => onChange({ ...entry, ...p });

  const handleAdd = (model) => {
    if (models.includes(model.value)) return;
    patch({ models: [...models, model.value] });
  };

  const handleRemove = (index) => {
    const next = models.filter((_, i) => i !== index);
    patch({ models: next.length === 0 ? [] : next });
  };

  // Helper: provider alias → 16-20px logo chip inside model id
  const chipProvider = (modelId) => (modelId?.includes("/") ? modelId.split("/")[0] : "");
  // Tiny formatter for pill badge ($8/M → "8", $0.5 → "0.5").
  const formatPr = (v) => (v == null ? "?" : v === 0 ? "0" : v >= 100 ? Math.round(v) : v >= 1 ? +v.toFixed(2) : v >= 0.01 ? +v.toFixed(3) : +v.toFixed(4));

  return (
    <Card padding="sm" className={`group ${!enabled ? "opacity-50" : ""} bg-[color:var(--md-sys-color-surfaceContainerLowest)]`}>
      {/* === Header block: enable toggle + label + description + hint list === */}
      <div className="flex items-start gap-3 mb-3">
        <Toggle
          checked={enabled}
          onChange={(v) => patch({ enabled: v })}
          aria-label={`Enable ${cap.label} adapter`}
        />
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="size-8 shrink-0 rounded-[var(--md-sys-shape-corner-small)] flex items-center justify-center"
            style={{ backgroundColor: "var(--md-sys-color-surfaceVariant, var(--color-brand-50))", color: "var(--md-sys-color-onSurfaceVariant, var(--color-brand-600))" }}
          >
            <span className="material-symbols-outlined text-[18px]">{cap.icon}</span>
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-medium text-[var(--md-sys-color-onSurface)] text-sm leading-tight">{cap.label}</p>
              <span className="text-[11px] text-[var(--md-sys-color-onSurfaceVariant)] truncate">{cap.desc}</span>
            </div>
            <p className="text-[11px] text-[var(--md-sys-color-onSurfaceVariant)] mt-0.5 leading-snug">
              Route a {cap.key} request to the first available model in the list.
            </p>
          </div>
        </div>
      </div>

      {/* === Chip list section — horizontal scroll, model ID on left, controls pinned on right === */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end min-w-0">
        <div
          role="list"
          aria-label={cap.label + " model pool"}
          className="flex min-w-0 flex-wrap items-stretch gap-2 overflow-x-auto pb-1 scroll-smooth
                     [scrollbar-color:var(--md-sys-color-outlineVariant)_transparent]
                     [scrollbar-width:thin] max-h-[200px] overflow-y-auto"
        >
          {models.length === 0 ? (
            <div className="inline-flex h-8 items-center rounded-[var(--md-sys-shape-corner-full)] border border-dashed
                            border-[var(--md-sys-color-outlineVariant)] px-3 text-xs text-[var(--md-sys-color-onSurfaceVariant)] italic"
              role="note" style={{ gridColumn: "1 / -1" }}
            >
              No models — add some to route {cap.key} traffic.
            </div>
          ) : models.map((model, index) => {
            const caps = getCaps?.(model) || null;
            const pricing = getPricing?.(model) || null;
            const hasPrice = pricing && (pricing.input != null || pricing.output != null);
            return (
              <span
                key={`${model}-${index}`}
                role="listitem"
                className="group inline-flex shrink-0 items-center gap-1.5
                           rounded-[var(--md-sys-shape-corner-full)]
                           bg-[var(--md-sys-color-secondaryContainer)]
                           px-0.5 py-0.5 pl-1.5 pr-1 h-8 max-w-[300px]
                           border border-[var(--md-sys-color-secondaryContainer)]
                           hover:border-[var(--md-sys-color-secondary)]
                           transition-[background-color,border-color,transform] duration-[var(--md-sys-motion-duration-short,120ms)]"
                style={{ color: "var(--md-sys-color-onSecondaryContainer)" }}
              >
                <span className="inline-block text-[9px] font-semibold opacity-70 tabular-nums">{index + 1}</span>
                <ProviderIcon
                  providerId={chipProvider(model)}
                  size={18}
                  className="rounded-[var(--md-sys-shape-corner-extra-small)]"
                  fallbackText={chipProvider(model).slice(0, 2).toUpperCase()}
                  fallbackColor="var(--md-sys-color-onSecondary)"
                />
                <code className="truncate font-mono text-[12px] leading-none max-w-[140px]" title={model}>
                  {model}
                </code>
                {caps && (
                  <span className="inline-flex items-center gap-0.5 pl-0.5">
                    <CapacityBadges caps={caps} colorOverride="var(--md-sys-color-onSecondaryContainer)" size={13} />
                  </span>
                )}
                {hasPrice && (
                  <span className="ml-auto inline-flex items-center
                                   rounded-full h-5 leading-none px-1.5
                                   bg-[color:var(--md-sys-color-surfaceContainerHigh)] text-[10px] font-mono whitespace-nowrap"
                    style={{ color: "var(--md-sys-color-onSurfaceVariant)" }}
                    title={`in $${pricing.input} / out $${pricing.output}/M`}
                  >
                    {formatPr(pricing.input)}/{formatPr(pricing.output)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(index)}
                  title={`Remove ${model}`}
                  aria-label={`Remove ${model}`}
                  className="w-6 h-6 -mr-0.5 shrink-0 inline-grid place-items-center rounded-full hover:bg-[var(--md-sys-color-secondary)] 
                             opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  style={{ color: "var(--md-sys-color-onSecondaryContainer)" }}
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              </span>
            );
          })}
        </div>

        {/* === Fixed-right buttons: round switch + add model === */}
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:gap-3">
          <label className="flex items-center gap-1.5 text-xs text-text-muted cursor-pointer select-none">
            <Toggle
              checked={roundRobin}
              onChange={(v) => patch({ roundRobin: v })}
              disabled={!enabled}
              aria-label={`Round-robin ${cap.label} adapter`}
            />
            <span>Round</span>
          </label>
          <Button
            icon="add"
            variant="ghost"
            size="sm"
            onClick={() => setShowModelSelect(true)}
            disabled={!enabled}
            title={`Add ${cap.label} model`}
          >
            Add Model
          </Button>
        </div>
      </div>

      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAdd}
          activeProviders={activeProviders}
          title={`Add ${cap.label} Model`}
          addedModelValues={models}
          capFilter={cap.key}
          closeOnSelect={false}
        />
      )}
    </Card>
  );
}

function ModelItem({
  index, model, isFirst, isLast, onMoveUp, onMoveDown, onRemove,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver,
}) {
  // Extract provider prefix from model name e.g. "kr/claude-sonnet-4.5" -> "kr"
  const providerPrefix = model.includes("/") ? model.split("/")[0] : "";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`group flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 border transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver ? "border-primary bg-black/[0.05] dark:bg-white/[0.06]" : "border-transparent"} bg-black/[0.02] hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]`}
    >
      {/* Drag handle */}
      <span className="cursor-grab active:cursor-grabbing text-text-muted/40 shrink-0" title="Drag to reorder">
        <svg width="12" height="16" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="8" cy="5" r="1.6"/><circle cx="16" cy="5" r="1.6"/>
          <circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/>
          <circle cx="8" cy="19" r="1.6"/><circle cx="16" cy="19" r="1.6"/>
        </svg>
      </span>

      {/* Index badge */}
      <span className="text-[10px] font-medium text-text-muted w-4 text-center shrink-0">{index + 1}</span>

      {/* Provider badge */}
      {providerPrefix && (
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 bg-brand-500/10 text-brand-600 dark:text-brand-300 shrink-0 leading-none tracking-wider">
          {providerPrefix}
        </span>
      )}

      {/* Full model value — no truncation, wraps naturally */}
      <div className="min-w-0 flex-1 rounded px-1.5 py-0.5 font-mono text-xs text-text-main break-all whitespace-normal leading-relaxed">
        {model}
      </div>

      {/* Priority arrows */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move up"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move down"
        >
          <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
        </button>
      </div>

      {/* Remove */}
      <button
        onClick={onRemove}
        className="p-0.5 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all"
        title="Remove"
      >
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
}

// Extract models at a flat index from group order
function groupModelsByProvider(models) {
  const groups = {};
  const groupOrder = [];
  for (const m of models) {
    const prefix = m.includes("/") ? m.split("/")[0] : "__nolabel__";
    if (!groups[prefix]) {
      groups[prefix] = { provider: prefix, models: [] };
      groupOrder.push(prefix);
    }
    groups[prefix].models.push(m);
  }
  return { groups, groupOrder };
}

function ProviderGroupHeader({
  provider, modelCount, isFirst, isLast, onMoveUp, onMoveDown, onRemoveGroup,
  onDragStart, onDragOver, onDrop, onDragEnd, isDragging, isDragOver,
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 py-1.5 px-2 rounded-md border transition-colors ${
        isDragging ? "opacity-40" : ""
      } ${isDragOver
        ? "border-primary bg-black/[0.06] dark:bg-white/[0.08]"
        : "border-transparent bg-black/[0.03] dark:bg-white/[0.03]"}`}
    >
      {/* Drag handle */}
      <span className="cursor-grab active:cursor-grabbing text-text-muted/40 shrink-0" title="Drag to reorder provider group" aria-hidden>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/>
          <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
          <circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/>
        </svg>
      </span>

      {/* Provider icon/name */}
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 bg-brand-500/15 text-brand-600 dark:text-brand-300 leading-none tracking-wider rounded">
          {provider}
        </span>
        <span className="text-[11px] text-text-muted">{modelCount} model{modelCount > 1 ? 's' : ''}</span>
      </div>

      {/* Move all models up/down */}
      <div className="flex items-center gap-0.5 shrink-0">
        <button
          onClick={onMoveUp}
          disabled={isFirst}
          className={`p-0.5 rounded text-[11px] ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move provider group up"
        >
          <span className="material-symbols-outlined text-[14px]">expand_less</span>
        </button>
        <button
          onClick={onMoveDown}
          disabled={isLast}
          className={`p-0.5 rounded text-[11px] ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`}
          title="Move provider group down"
        >
          <span className="material-symbols-outlined text-[14px]">expand_more</span>
        </button>
        {/* Bulk-delete this provider group and all its models */}
        <button
          onClick={onRemoveGroup}
          className="p-0.5 rounded text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-all"
          title={`Delete all ${modelCount} model${modelCount > 1 ? 's' : ''} from ${provider}`}
        >
          <span className="material-symbols-outlined text-[14px]">delete</span>
        </button>
      </div>
    </div>
  );
}

function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null }) {
  // Initialize state with combo values - key prop on parent handles reset on remount
  const [name, setName] = useState(combo?.name || "");
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Derive provider groups from flat models array
  const { groups: providerGroups, groupOrder } = groupModelsByProvider(models);
  // Build a flat list of [providerIndex, modelIndex] pairs for array operations
  const flatPositions = [];
  for (let gi = 0; gi < groupOrder.length; gi++) {
    const g = providerGroups[groupOrder[gi]];
    for (let mi = 0; mi < g.models.length; mi++) {
      flatPositions.push({ providerIndex: gi, modelIndex: mi });
    }
  }

  const handleDragEnd = (event) => {
    // Currently disabled for provider-grouped layout
    // Full DnD with groups coming in future update
  };

  const fetchModalData = async () => {
    try {
      const aliasesRes = await fetch("/api/models/alias");
      if (!aliasesRes.ok) return;
      const aliasesData = await aliasesRes.json();
      setModelAliases(aliasesData.aliases || {});
    } catch (error) {
      console.error("Error fetching modal data:", error);
    }
  };

  useEffect(() => {
    if (isOpen) fetchModalData();
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) {
      setNameError("Name is required");
      return false;
    }
    if (!VALID_NAME_REGEX.test(value)) {
      setNameError("Only letters, numbers, -, _ and . allowed");
      return false;
    }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    const value = e.target.value;
    setName(value);
    if (value) validateName(value);
    else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) {
      setModels([...models, model.value]);
    }
  };

  /* === Add ALL models from a provider === */
  const handleAddAllProviderModels = (providerId) => {
    // Close the selector and re-open with provider filter
    setShowModelSelect(false);
    // We use setTimeout so state changes batch properly
    setTimeout(() => {
      setShowModelSelect(true);
    }, 100);
  };

  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };

  const handleRemoveModel = (flatIndex) => {
    setModels(models.filter((_, i) => i !== flatIndex));
  };

  /* === Move individual model up/down === */
  const handleModelMove = (flatIndex, delta) => {
    const target = flatIndex + delta;
    if (target < 0 || target >= models.length) return;
    const newModels = [...models];
    [newModels[flatIndex], newModels[target]] = [newModels[target], newModels[flatIndex]];
    setModels(newModels);
  };

  /* === Move entire provider group up/down === */
  const handleProviderGroupMove = (providerIndex, delta) => {
    const targetGroup = providerIndex + delta;
    if (targetGroup < 0 || targetGroup >= groupOrder.length) return;

    const fromProvider = groupOrder[providerIndex];
    const toProvider = groupOrder[targetGroup];
    const fromModels = providerGroups[fromProvider].models;
    const toModels = providerGroups[toProvider].models;

    // Calculate flat positions for the provider groups
    const fromFlatStart = flatPositions.findIndex(p => p.providerIndex === providerIndex);
    const fromFlatEnd = fromFlatStart + fromModels.length;
    const toFlatStart = flatPositions.findIndex(p => p.providerIndex === targetGroup);

    const newModels = [...models];
    // Extract all models of the fromProvider
    const moved = newModels.splice(fromFlatStart, fromModels.length);
    // Insert at the toProvider's position
    const insertAt = targetGroup > providerIndex ? toFlatStart + toModels.length : toFlatStart;
    newModels.splice(insertAt, 0, ...moved);
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  // Recount after potential mutations
  const groups = groupModelsByProvider(models);
  const { groups: currentGroups, groupOrder: currentOrder } = groups;

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={isEdit ? "Edit Combo" : "Create Combo"}
        size="lg"
        className="min-w-[600px]!"
      >
        <div className="flex flex-col gap-3">
          {/* Name */}
          <div>
            <Input
              label="Combo Name"
              value={name}
              onChange={handleNameChange}
              placeholder="my-combo"
              error={nameError}
            />
            <p className="text-[10px] text-text-muted mt-0.5">
              Only letters, numbers, -, _ and . allowed
            </p>
          </div>

          {/* Models */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium">Models</label>
              <span className="text-[11px] text-text-muted">{models.length} model{models.length !== 1 ? 's' : ''}</span>
            </div>

            {models.length === 0 ? (
              <div className="text-center py-4 border border-dashed border-black/10 dark:border-white/10 rounded-lg bg-black/[0.01] dark:bg-white/[0.01]">
                <span className="material-symbols-outlined text-text-muted text-xl mb-1">layers</span>
                <p className="text-xs text-text-muted">No models added yet</p>
              </div>
            ) : (
              <div className="flex max-h-[55vh] min-w-0 flex-col gap-2 overflow-y-auto sm:max-h-[400px]">
                {currentOrder.map((provider, gi) => {
                  const group = currentGroups[provider];
                  let flatStart = 0;
                  for (let i = 0; i < gi; i++) flatStart += currentGroups[currentOrder[i]].models.length;

                  return (
                    <div key={provider} className="flex flex-col gap-1">
                      {/* Provider group header */}
                      <ProviderGroupHeader
                        provider={provider}
                        modelCount={group.models.length}
                        isFirst={gi === 0}
                        isLast={gi === currentOrder.length - 1}
                        onMoveUp={() => handleProviderGroupMove(gi, -1)}
                        onMoveDown={() => handleProviderGroupMove(gi, 1)}
                      />

                      {/* Models in this provider group */}
                      <div className="flex flex-col gap-0.5 ml-2 pl-2 border-l-2 border-black/5 dark:border-white/5">
                        {group.models.map((model, mi) => {
                          const flatIndex = flatStart + mi;
                          return (
                            <ModelItem
                              key={`${provider}-${mi}`}
                              index={flatIndex}
                              model={model}
                              isFirst={flatIndex === 0}
                              isLast={flatIndex === models.length - 1}
                              onMoveUp={() => handleModelMove(flatIndex, -1)}
                              onMoveDown={() => handleModelMove(flatIndex, 1)}
                              onRemove={() => handleRemoveModel(flatIndex)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Add Model button */}
            <button
              onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Model
            </button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button onClick={onClose} variant="ghost" fullWidth size="sm">
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              fullWidth
              size="sm"
              disabled={!name.trim() || !!nameError || saving}
            >
              {saving ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Model Select Modal */}
      {showModelSelect && (
        <ModelSelectModal
          isOpen={showModelSelect}
          onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel}
          onDeselect={handleDeselectModel}
          activeProviders={activeProviders}
          modelAliases={modelAliases}
          title="Add Model to Combo"
          kindFilter={kindFilter}
          addedModelValues={models}
          closeOnSelect={false}
        />
      )}
    </>
  );
}
