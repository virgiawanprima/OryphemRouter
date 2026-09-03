// Image provider adapter registry
import createOpenAIAdapter from "./openai.js";
import gemini from "./gemini.js";
import codex from "./codex.js";
import sdwebui from "./sdwebui.js";
import comfyui from "./comfyui.js";
import huggingface from "./huggingface.js";
import nanobanana from "./nanobanana.js";
import falAi from "./falAi.js";
import stabilityAi from "./stabilityAi.js";
import blackForestLabs from "./blackForestLabs.js";
import runwayml from "./runwayml.js";
import cloudflareAi from "./cloudflareAi.js";
import antigravity from "./antigravity.js";
import adobeFirefly from "./adobeFirefly.js";
import aihorde from "./aihorde.js";
import alibabaImage from "./alibabaImage.js";
import chatgptWeb from "./chatgptWeb.js";
import cursorAgentImage from "./cursorAgentImage.js";
import designerWeb from "./designerWeb.js";
import haiper from "./haiper.js";
import hyperbolic from "./hyperbolic.js";
import ideogram from "./ideogram.js";
import imagen3 from "./imagen3.js";
import leonardo from "./leonardo.js";
import magnific from "./magnific.js";
import nvidiaNim from "./nvidiaNim.js";
import segmind from "./segmind.js";

const ADAPTERS = {
  openai: createOpenAIAdapter("openai"),
  minimax: createOpenAIAdapter("minimax"),
  openrouter: createOpenAIAdapter("openrouter"),
  recraft: createOpenAIAdapter("recraft"),
  "vercel-ai-gateway": createOpenAIAdapter("vercel-ai-gateway"),
  xai: createOpenAIAdapter("xai"),
  gemini,
  codex,
  sdwebui,
  comfyui,
  huggingface,
  nanobanana,
  antigravity,
  "fal-ai": falAi,
  "stability-ai": stabilityAi,
  "black-forest-labs": blackForestLabs,
  runwayml,
  "cloudflare-ai": cloudflareAi,
  "adobe-firefly": adobeFirefly,
  aihorde,
  alibaba: alibabaImage,
  "chatgpt-web": chatgptWeb,
  cursor: cursorAgentImage,
  "microsoft-designer-web": designerWeb,
  haiper,
  hyperbolic,
  ideogram,
  imagen3,
  leonardo,
  magnific,
  nvidia: nvidiaNim,
  segmind,
};

export function getImageAdapter(provider) {
  return ADAPTERS[provider] || null;
}

export function isImageProvider(provider) {
  return provider in ADAPTERS;
}
