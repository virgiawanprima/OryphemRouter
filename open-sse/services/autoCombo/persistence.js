import fs from "fs";
import path from "path";
import { resolveDataDir } from "../../utils/omni/dataPaths.js";
const PERSISTENCE_DIR = resolveDataDir();
const STATE_FILE = path.join(PERSISTENCE_DIR, "auto_combo_state.json");
let stateCache = /* @__PURE__ */ new Map();
function saveAdaptationState(state) {
  stateCache.set(state.comboId, { ...state, lastUpdated: (/* @__PURE__ */ new Date()).toISOString() });
  persistToDisk();
}
function loadAdaptationState(comboId) {
  if (stateCache.size === 0) loadFromDisk();
  return stateCache.get(comboId) || null;
}
function listAdaptationStates() {
  if (stateCache.size === 0) loadFromDisk();
  return [...stateCache.values()];
}
function deleteAdaptationState(comboId) {
  const existed = stateCache.delete(comboId);
  if (existed) persistToDisk();
  return existed;
}
function recordDecision(comboId, provider, score, wasExploration) {
  let state = stateCache.get(comboId);
  if (!state) {
    state = {
      comboId,
      providerScores: {},
      exclusionHistory: [],
      modePackHistory: [],
      totalDecisions: 0,
      explorationHits: 0,
      lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
    };
  }
  const alpha = 0.1;
  const prev = state.providerScores[provider] || 0.5;
  state.providerScores[provider] = prev * (1 - alpha) + score * alpha;
  state.totalDecisions++;
  if (wasExploration) state.explorationHits++;
  state.lastUpdated = (/* @__PURE__ */ new Date()).toISOString();
  stateCache.set(comboId, state);
  if (state.totalDecisions % 10 === 0) persistToDisk();
}
function persistToDisk() {
  try {
    if (!fs.existsSync(PERSISTENCE_DIR)) {
      fs.mkdirSync(PERSISTENCE_DIR, { recursive: true });
    }
    const data = Object.fromEntries(stateCache);
    fs.writeFileSync(STATE_FILE, JSON.stringify(data, null, 2));
  } catch {
  }
}
function loadFromDisk() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const raw = fs.readFileSync(STATE_FILE, "utf-8");
      const data = JSON.parse(raw);
      stateCache = new Map(Object.entries(data));
    }
  } catch {
  }
}
export {
  deleteAdaptationState,
  listAdaptationStates,
  loadAdaptationState,
  recordDecision,
  saveAdaptationState
};
