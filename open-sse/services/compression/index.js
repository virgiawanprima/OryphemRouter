import {
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_CAVEMAN_CONFIG,
  DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG,
  DEFAULT_RTK_CONFIG,
  DEFAULT_COMPRESSION_LANGUAGE_CONFIG,
  DEFAULT_AGGRESSIVE_CONFIG,
  DEFAULT_CODEX_RESPONSES_CONFIG
} from "./types.js";
import {
  applyLiteCompression,
  collapseWhitespace,
  dedupSystemPrompt,
  compressToolResults,
  removeRedundantContent,
  replaceImageUrls
} from "./lite.js";
import { cavemanCompress, applyRulesToText } from "./caveman.js";
import { getRulesForContext, getCavemanRuleMetadata, CAVEMAN_RULES } from "./cavemanRules.js";
import {
  getAvailableLanguagePacks,
  listCavemanRulePacks,
  loadAllRulesForLanguage,
  loadCavemanFileRules,
  loadRulePack,
  validateRulePack
} from "./ruleLoader.js";
import {
  detectCompressionLanguage,
  listSupportedCompressionLanguages
} from "./languageDetector.js";
import {
  extractPreservedBlocks,
  restorePreservedBlocks,
  findFencedCodeBlocks
} from "./preservation.js";
import { validateCompression } from "./validation.js";
import {
  applyCavemanOutputMode,
  buildCavemanOutputInstruction,
  shouldBypassCavemanOutputMode
} from "./outputMode.js";
import { buildCompressionDiff, buildCompressionPreviewDiff } from "./diffHelper.js";
import {
  estimateCompressionTokens,
  createCompressionStats,
  trackCompressionStats,
  getDefaultCompressionConfig
} from "./stats.js";
import {
  selectCompressionStrategy,
  getEffectiveMode,
  applyCompression,
  applyCompressionAsync,
  checkComboOverride,
  shouldAutoTrigger,
  applyStackedCompression,
  applyStackedCompressionAsync
} from "./strategySelector.js";
import {
  registerEngine,
  registerCompressionEngine,
  unregisterCompressionEngine,
  getEngine,
  getEngineEntry,
  getCompressionEngine,
  listEngines,
  listCompressionEngines,
  listEnabledEngines,
  setEngineEnabled,
  updateEngineConfig,
  clearCompressionEngineRegistry
} from "./engines/registry.js";
import { registerBuiltinCompressionEngines } from "./engines/index.js";
import { codexResponsesEngine } from "./engines/codexResponses/index.js";
import { applyRtkCompression, processRtkText, rtkEngine } from "./engines/rtk/index.js";
import {
  detectCommandFromText,
  detectCommandOutput,
  detectCommandType
} from "./engines/rtk/commandDetector.js";
import {
  loadRtkFilters,
  getRtkFilterCatalog,
  matchRtkFilter,
  getRtkFilterLoadDiagnostics
} from "./engines/rtk/filterLoader.js";
import { runRtkFilterTests } from "./engines/rtk/verify.js";
import {
  maybePersistRtkRawOutput,
  readRtkRawOutput,
  redactRtkRawOutput
} from "./engines/rtk/rawOutput.js";
import {
  detectCodeLanguage,
  normalizeCodeLanguage,
  stripCode
} from "./engines/rtk/codeStripper.js";
import { RuleBasedSummarizer, createSummarizer } from "./summarizer.js";
import { compressToolResult } from "./toolResultCompressor.js";
import { applyAging } from "./progressiveAging.js";
import { compressAggressive } from "./aggressive.js";
import { STOPWORDS, FORCE_PRESERVE_RE, scoreToken, pruneByScore } from "./ultraHeuristic.js";
import { ultraCompress } from "./ultra.js";
import { ultraCompressHeuristic } from "./ultra.js";
import {
  slmAvailable,
  runLlmlinguaUltra,
  prewarmLlmlinguaUltra
} from "./engines/llmlingua/ultraEntry.js";
import { DEFAULT_ULTRA_CONFIG } from "./types.js";
export {
  CAVEMAN_RULES,
  DEFAULT_AGGRESSIVE_CONFIG,
  DEFAULT_CAVEMAN_CONFIG,
  DEFAULT_CAVEMAN_OUTPUT_MODE_CONFIG,
  DEFAULT_CODEX_RESPONSES_CONFIG,
  DEFAULT_COMPRESSION_CONFIG,
  DEFAULT_COMPRESSION_LANGUAGE_CONFIG,
  DEFAULT_RTK_CONFIG,
  DEFAULT_ULTRA_CONFIG,
  FORCE_PRESERVE_RE,
  RuleBasedSummarizer,
  STOPWORDS,
  applyAging,
  applyCavemanOutputMode,
  applyCompression,
  applyCompressionAsync,
  applyLiteCompression,
  applyRtkCompression,
  applyRulesToText,
  applyStackedCompression,
  applyStackedCompressionAsync,
  buildCavemanOutputInstruction,
  buildCompressionDiff,
  buildCompressionPreviewDiff,
  cavemanCompress,
  checkComboOverride,
  clearCompressionEngineRegistry,
  codexResponsesEngine,
  collapseWhitespace,
  compressAggressive,
  compressToolResult,
  compressToolResults,
  createCompressionStats,
  createSummarizer,
  dedupSystemPrompt,
  detectCodeLanguage,
  detectCommandFromText,
  detectCommandOutput,
  detectCommandType,
  detectCompressionLanguage,
  estimateCompressionTokens,
  extractPreservedBlocks,
  findFencedCodeBlocks,
  getAvailableLanguagePacks,
  getCavemanRuleMetadata,
  getCompressionEngine,
  getDefaultCompressionConfig,
  getEffectiveMode,
  getEngine,
  getEngineEntry,
  getRtkFilterCatalog,
  getRtkFilterLoadDiagnostics,
  getRulesForContext,
  listCavemanRulePacks,
  listCompressionEngines,
  listEnabledEngines,
  listEngines,
  listSupportedCompressionLanguages,
  loadAllRulesForLanguage,
  loadCavemanFileRules,
  loadRtkFilters,
  loadRulePack,
  matchRtkFilter,
  maybePersistRtkRawOutput,
  normalizeCodeLanguage,
  prewarmLlmlinguaUltra,
  processRtkText,
  pruneByScore,
  readRtkRawOutput,
  redactRtkRawOutput,
  registerBuiltinCompressionEngines,
  registerCompressionEngine,
  registerEngine,
  removeRedundantContent,
  replaceImageUrls,
  restorePreservedBlocks,
  rtkEngine,
  runLlmlinguaUltra,
  runRtkFilterTests,
  scoreToken,
  selectCompressionStrategy,
  setEngineEnabled,
  shouldAutoTrigger,
  shouldBypassCavemanOutputMode,
  slmAvailable,
  stripCode,
  trackCompressionStats,
  ultraCompress,
  ultraCompressHeuristic,
  unregisterCompressionEngine,
  updateEngineConfig,
  validateCompression,
  validateRulePack
};
