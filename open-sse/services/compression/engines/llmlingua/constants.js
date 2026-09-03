const DEFAULT_LLMLINGUA_MODEL = "tinybert";
const LLMLINGUA_MODELS = {
  tinybert: {
    id: "tinybert",
    hfRepo: "atjsh/llmlingua-2-js-tinybert-meetingbank",
    factory: "WithBERTMultilingual",
    dtype: "fp32",
    subfolder: "",
    sizeMB: 57,
    label: "TinyBERT (57MB, fast \u2014 default)"
  },
  "bert-base": {
    id: "bert-base",
    hfRepo: "Arcoldd/llmlingua4j-bert-base-onnx",
    factory: "WithBERTMultilingual",
    dtype: "fp32",
    subfolder: "",
    sizeMB: 710,
    label: "BERT-base (710MB, higher accuracy)"
  }
};
const LLMLINGUA_WORKER_TIMEOUT_MS = 5e3;
const LLMLINGUA_WORKER_IDLE_MS = 3e5;
export {
  DEFAULT_LLMLINGUA_MODEL,
  LLMLINGUA_MODELS,
  LLMLINGUA_WORKER_IDLE_MS,
  LLMLINGUA_WORKER_TIMEOUT_MS
};
