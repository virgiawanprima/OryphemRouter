const DEFAULT_LADDER = [
  { engine: "session-dedup" },
  // lossless cross-turn dedup (catalog pri 3)
  { engine: "rtk", intensity: "standard" },
  // command-output filtering (pri 10)
  { engine: "headroom" },
  // tabular JSON compaction (pri 15)
  { engine: "lite" },
  // whitespace/format cleanup (pri 5, but cheap prose pass)
  { engine: "caveman", intensity: "full" },
  // rule-based prose (pri 20)
  { engine: "aggressive" },
  // summarize + age old turns (pri 30)
  { engine: "ultra" }
  // heuristic token pruning + optional SLM (pri 40)
];
const AGGRESSIVENESS = {
  off: 0,
  "session-dedup": 10,
  // stackPriority 3 — lossless cross-turn dedup
  ccr: 15,
  // stackPriority 4 — reversible retrieval marker, only if it shrinks
  rtk: 20,
  // stackPriority 10 — command-output filtering
  "codex-responses": 22,
  // stackPriority 12 (#8010) — conservative Responses tool-output compression
  ionizer: 25,
  // stackPriority 13 — tabular row sampling (lighter than headroom)
  headroom: 30,
  // stackPriority 15 — tabular JSON compaction
  lite: 40,
  // pri 5, but cheap prose pass (pre-existing reorder, kept as-is)
  "read-lifecycle": 42,
  // stackPriority 5 (ties lite) — narrow-scope, opt-in, fully lossy
  relevance: 45,
  // stackPriority 18 — extractive sentence scoring, opt-in
  caveman: 50,
  standard: 50,
  // mode-name alias for caveman
  stacked: 50,
  // a derived/stacked base plan sits at the prose tier; floor escalates past it
  aggressive: 60,
  llmlingua: 65,
  // stackPriority 35 — semantic pruning (ONNX), after aggressive, before ultra/llm
  llm: 68,
  // stackPriority 38 — full LLM-tier compressor, opt-in default-off
  ultra: 70,
  omniglyph: 80
  // stackPriority 90 — context-as-image (lossy render), runs after every text engine
};
function aggressivenessOf(engineOrMode) {
  return AGGRESSIVENESS[engineOrMode] ?? 0;
}
const REDUCTION_FACTOR = {
  "session-dedup": 0.95,
  ccr: 0.9,
  // conservative: only replaces a block when the marker is shorter than it
  rtk: 0.85,
  "codex-responses": 0.84,
  // stackPriority 12 (#8010) — lossless-first, bounded diagnostic trims
  ionizer: 0.83,
  // row sampling, lighter than headroom's full tabular compaction
  headroom: 0.8,
  lite: 0.92,
  "read-lifecycle": 0.88,
  // scope-limited to stale/superseded Read tool-results
  relevance: 0.75,
  // extractive sentence dropping
  caveman: 0.7,
  standard: 0.7,
  aggressive: 0.55,
  llmlingua: 0.5,
  // semantic pruning (ONNX)
  llm: 0.45,
  // full LLM-tier compressor, stronger than llmlingua
  ultra: 0.4,
  omniglyph: 0.35
  // measured 0.23-0.33 on converted blocks (254->84 tokens); 0.35 stays conservative
};
function expectedReductionFactor(engine) {
  return REDUCTION_FACTOR[engine] ?? 0.9;
}
export {
  DEFAULT_LADDER,
  aggressivenessOf,
  expectedReductionFactor
};
