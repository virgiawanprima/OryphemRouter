"use client";

import { useState, useEffect } from "react";
import Modal from "./Modal";
import Input from "./Input";
import Button from "./Button";
import ModelSelectModal from "./ModelSelectModal";

const VALID_NAME_REGEX = /^[a-zA-Z0-9_.\-]+$/;

// Group models by provider prefix, preserving order within each group
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

function ModelItem({ index, model, isFirst, isLast, onMoveUp, onMoveDown, onRemove }) {
  const providerPrefix = model.includes("/") ? model.split("/")[0] : "";
  return (
    <div className="group flex min-w-0 items-center gap-1.5 rounded-md bg-black/[0.02] px-2 py-1 transition-colors hover:bg-black/[0.04] dark:bg-white/[0.02] dark:hover:bg-white/[0.04]">
      <span className="text-[10px] font-medium text-text-muted w-4 text-center shrink-0">{index + 1}</span>
      {providerPrefix && (
        <span className="text-[9px] font-bold uppercase px-1 py-0.5 bg-brand-500/10 text-brand-600 dark:text-brand-300 shrink-0 leading-none tracking-wider">
          {providerPrefix}
        </span>
      )}
      <div className="min-w-0 flex-1 rounded px-1.5 py-0.5 font-mono text-xs text-text-main break-all whitespace-normal leading-relaxed">
        {model}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <button onClick={onMoveUp} disabled={isFirst}
          className={`p-0.5 rounded ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`} title="Move up">
          <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
        </button>
        <button onClick={onMoveDown} disabled={isLast}
          className={`p-0.5 rounded ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`} title="Move down">
          <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
        </button>
      </div>
      <button onClick={onRemove} className="p-0.5 hover:bg-red-500/10 rounded text-text-muted hover:text-red-500 transition-all" title="Remove">
        <span className="material-symbols-outlined text-[14px]">close</span>
      </button>
    </div>
  );
}

function ProviderGroupHeader({ provider, modelCount, isFirst, isLast, onMoveUp, onMoveDown }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 bg-black/[0.03] dark:bg-white/[0.03] rounded-md">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-text-muted/40 shrink-0">
        <circle cx="9" cy="4" r="2"/><circle cx="15" cy="4" r="2"/>
        <circle cx="9" cy="12" r="2"/><circle cx="15" cy="12" r="2"/>
        <circle cx="9" cy="20" r="2"/><circle cx="15" cy="20" r="2"/>
      </svg>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <span className="text-[11px] font-bold uppercase px-1.5 py-0.5 bg-brand-500/15 text-brand-600 dark:text-brand-300 leading-none tracking-wider rounded">
          {provider}
        </span>
        <span className="text-[11px] text-text-muted">{modelCount} model{modelCount > 1 ? 's' : ''}</span>
      </div>
      <div className="flex items-center gap-0.5 shrink-0">
        <button onClick={onMoveUp} disabled={isFirst}
          className={`p-0.5 rounded text-[11px] ${isFirst ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`} title="Move group up">
          <span className="material-symbols-outlined text-[14px]">expand_less</span>
        </button>
        <button onClick={onMoveDown} disabled={isLast}
          className={`p-0.5 rounded text-[11px] ${isLast ? "text-text-muted/20 cursor-not-allowed" : "text-text-muted hover:text-primary hover:bg-black/5 dark:hover:bg-white/5"}`} title="Move group down">
          <span className="material-symbols-outlined text-[14px]">expand_more</span>
        </button>
      </div>
    </div>
  );
}

// Reusable Combo create/edit modal. forcePrefix auto-prepends to name.
export default function ComboFormModal({ isOpen, combo, onClose, onSave, activeProviders, kindFilter = null, forcePrefix = "", title }) {
  // Strip prefix when editing existing combo so user only edits suffix
  const initialName = combo?.name
    ? (forcePrefix && combo.name.startsWith(forcePrefix) ? combo.name.slice(forcePrefix.length) : combo.name)
    : "";
  const [name, setName] = useState(initialName);
  const [models, setModels] = useState(combo?.models || []);
  const [showModelSelect, setShowModelSelect] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nameError, setNameError] = useState("");
  const [modelAliases, setModelAliases] = useState({});

  useEffect(() => {
    if (!isOpen) return;
    fetch("/api/models/alias").then((r) => r.ok ? r.json() : null).then((d) => d && setModelAliases(d.aliases || {})).catch(() => {});
  }, [isOpen]);

  const validateName = (value) => {
    if (!value.trim()) { setNameError("Name is required"); return false; }
    const full = forcePrefix + value;
    if (!VALID_NAME_REGEX.test(full)) { setNameError("Only letters, numbers, -, _ and . allowed"); return false; }
    setNameError("");
    return true;
  };

  const handleNameChange = (e) => {
    let value = e.target.value;
    // If user types prefix manually, strip it (we always prepend)
    if (forcePrefix && value.startsWith(forcePrefix)) value = value.slice(forcePrefix.length);
    setName(value);
    if (value) validateName(value); else setNameError("");
  };

  const handleAddModel = (model) => {
    if (!models.includes(model.value)) setModels([...models, model.value]);
  };
  const handleDeselectModel = (model) => {
    setModels(models.filter((m) => m !== model.value));
  };
  const handleRemoveModel = (i) => setModels(models.filter((_, idx) => idx !== i));
  const handleMoveUp = (i) => {
    if (i === 0) return;
    const a = [...models]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setModels(a);
  };
  const handleMoveDown = (i) => {
    if (i === models.length - 1) return;
    const a = [...models]; [a[i], a[i + 1]] = [a[i + 1], a[i]]; setModels(a);
  };

  // === Provider-grouped move helpers ===
  const { groups: currentGroups, groupOrder: currentOrder } = groupModelsByProvider(models);

  const handleProviderGroupMove = (providerIndex, delta) => {
    const targetGroup = providerIndex + delta;
    if (targetGroup < 0 || targetGroup >= currentOrder.length) return;
    const fromProvider = currentOrder[providerIndex];
    const toProvider = currentOrder[targetGroup];
    const fromLen = currentGroups[fromProvider].models.length;
    // Count flat start of target group
    let fromFlatStart = 0, toFlatStart = 0;
    for (let gi = 0; gi < currentOrder.length; gi++) {
      if (gi === providerIndex) break;
      fromFlatStart += currentGroups[currentOrder[gi]].models.length;
    }
    for (let gi = 0; gi < currentOrder.length; gi++) {
      if (gi === targetGroup) break;
      toFlatStart += currentGroups[currentOrder[gi]].models.length;
    }
    const newModels = [...models];
    const moved = newModels.splice(fromFlatStart, fromLen);
    const insertAt = targetGroup > providerIndex ? toFlatStart + currentGroups[toProvider].models.length : toFlatStart;
    newModels.splice(insertAt, 0, ...moved);
    setModels(newModels);
  };

  const handleModelMoveWithGroup = (flatIndex, delta) => {
    const target = flatIndex + delta;
    if (target < 0 || target >= models.length) return;
    const newModels = [...models];
    [newModels[flatIndex], newModels[target]] = [newModels[target], newModels[flatIndex]];
    setModels(newModels);
  };

  const handleSave = async () => {
    if (!validateName(name)) return;
    setSaving(true);
    await onSave({ name: forcePrefix + name.trim(), models });
    setSaving(false);
  };

  const isEdit = !!combo;

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title={title || (isEdit ? "Edit Combo" : "Create Combo")}>
        <div className="flex flex-col gap-3">
          <div>
            {forcePrefix ? (
              <>
                <label className="text-sm font-medium mb-1 block">Combo Name</label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center px-2 rounded-l border border-r-0 border-black/10 dark:border-white/10 bg-black/[0.04] dark:bg-white/[0.04] text-text-muted font-mono text-sm">{forcePrefix}</span>
                  <input value={name} onChange={handleNameChange} placeholder="my-combo"
                    className="flex-1 min-w-0 rounded-r border border-black/10 dark:border-white/10 bg-white dark:bg-black/20 px-2 py-1.5 font-mono text-sm outline-none focus:border-primary" />
                </div>
                {nameError && <p className="text-[11px] text-red-500 mt-0.5">{nameError}</p>}
              </>
            ) : (
              <Input label="Combo Name" value={name} onChange={handleNameChange} placeholder="my-combo" error={nameError} />
            )}
            <p className="text-[10px] text-text-muted mt-0.5">
              {forcePrefix ? `Auto-prefixed with "${forcePrefix}". ` : ""}Only letters, numbers, -, _ and . allowed
            </p>
          </div>

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
                      <ProviderGroupHeader
                        provider={provider}
                        modelCount={group.models.length}
                        isFirst={gi === 0}
                        isLast={gi === currentOrder.length - 1}
                        onMoveUp={() => handleProviderGroupMove(gi, -1)}
                        onMoveDown={() => handleProviderGroupMove(gi, 1)}
                      />
                      <div className="flex flex-col gap-0.5 ml-2 pl-2 border-l-2 border-black/5 dark:border-white/5">
                        {group.models.map((model, mi) => {
                          const flatIndex = flatStart + mi;
                          return (
                            <ModelItem key={`${provider}-${mi}`} index={flatIndex} model={model}
                              isFirst={flatIndex === 0} isLast={flatIndex === models.length - 1}
                              onMoveUp={() => handleModelMoveWithGroup(flatIndex, -1)}
                              onMoveDown={() => handleModelMoveWithGroup(flatIndex, 1)}
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
            <button onClick={() => setShowModelSelect(true)}
              className="w-full mt-2 py-2 border border-dashed border-black/10 dark:border-white/10 rounded-lg text-xs text-primary font-medium hover:text-primary hover:border-primary/50 transition-colors flex items-center justify-center gap-1">
              <span className="material-symbols-outlined text-[16px]">add</span>
              Add Model
            </button>
          </div>

          <div className="flex flex-col gap-2 pt-1 sm:flex-row">
            <Button onClick={onClose} variant="ghost" fullWidth size="sm">Cancel</Button>
            <Button onClick={handleSave} fullWidth size="sm" disabled={!name.trim() || !!nameError || saving}>
              {saving ? "Saving..." : isEdit ? "Save" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {showModelSelect && (
        <ModelSelectModal isOpen={showModelSelect} onClose={() => setShowModelSelect(false)}
          onSelect={handleAddModel} onDeselect={handleDeselectModel}
          activeProviders={activeProviders} modelAliases={modelAliases}
          title="Add Model to Combo" kindFilter={kindFilter}
          addedModelValues={models} closeOnSelect={false} />
      )}
    </>
  );
}
