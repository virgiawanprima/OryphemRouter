import { parentPort } from "node:worker_threads";
import {
  resolveLlmlinguaModel,
  configureTransformersEnv
} from "./modelStore.js";
function dynamicImport(specifier) {
  return import(
    /* @vite-ignore */
    specifier
  );
}
const compressorCache = /* @__PURE__ */ new Map();
function cacheKey(entry, modelPath) {
  return `${entry.factory}:${entry.hfRepo}:${modelPath || ""}`;
}
async function getCompressor(entry, modelPath) {
  const { env } = await dynamicImport("@huggingface/transformers");
  configureTransformersEnv(env, { modelPath });
  const { LLMLingua2 } = await dynamicImport("@atjsh/llmlingua-2");
  const { Tiktoken } = await dynamicImport("js-tiktoken/lite");
  const o200k_base = (await dynamicImport("js-tiktoken/ranks/o200k_base")).default;
  const oai = new Tiktoken(o200k_base);
  const { promptCompressor } = await LLMLingua2[entry.factory](entry.hfRepo, {
    transformerJSConfig: { device: "cpu", dtype: entry.dtype },
    oaiTokenizer: oai,
    modelSpecificOptions: { subfolder: entry.subfolder },
    // MUST silence — the lib console.logs huge objects otherwise.
    logger: () => {
    }
  });
  return { compressor: promptCompressor, oai };
}
const MAX_SEG_TOKENS = 450;
async function compressSegmented(compressor, oai, text, rate) {
  const tokens = oai.encode(text);
  if (tokens.length <= MAX_SEG_TOKENS) {
    return compressor.compress(text, { rate });
  }
  const segments = [];
  const END_TOKENS = /* @__PURE__ */ new Set([".", "\n", "!", "?", ";"]);
  let st = 0;
  while (st < tokens.length) {
    let ed = Math.min(st + MAX_SEG_TOKENS, tokens.length);
    for (let j = 0; j < Math.min(80, ed - st); j++) {
      const tok = oai.decode(tokens.slice(ed - 1 - j, ed - j));
      if (END_TOKENS.has(tok)) {
        ed = ed - j;
        break;
      }
    }
    if (ed <= st) ed = Math.min(st + MAX_SEG_TOKENS, tokens.length);
    segments.push(oai.decode(tokens.slice(st, ed)));
    st = ed;
  }
  const out = [];
  for (const seg of segments) {
    out.push(await compressor.compress(seg, { rate }));
  }
  return out.join("\n");
}
if (parentPort) {
  parentPort.on("message", async (msg) => {
    const { id, text } = msg;
    try {
      const entry = resolveLlmlinguaModel(msg.model);
      const key = cacheKey(entry, msg.modelPath);
      let pending = compressorCache.get(key);
      if (!pending) {
        pending = getCompressor(entry, msg.modelPath);
        compressorCache.set(key, pending);
        pending.catch(() => {
          compressorCache.delete(key);
        });
      }
      const { compressor, oai } = await pending;
      const rate = typeof msg.compressionRate === "number" ? msg.compressionRate : 0.5;
      const out = await compressSegmented(compressor, oai, text, rate);
      parentPort.postMessage({ id, ok: true, text: out });
    } catch {
      parentPort.postMessage({ id, ok: false, text });
    }
  });
}
