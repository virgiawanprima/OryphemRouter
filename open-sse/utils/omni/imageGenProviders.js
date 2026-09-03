// ADAPTED STUB — aggregate of handlers/imageGeneration/providers/*.ts + pollinationsAnonAuth.ts
// (provider handler subdir was not part of the handler port scope). Each handler returns a
// graceful 501 result if actually invoked; importing this module never throws.

async function handleSDWebUIImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleSDWebUIImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleHyperbolicImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleHyperbolicImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleHuggingFaceImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleHuggingFaceImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleComfyUIImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleComfyUIImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleImagen3ImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleImagen3ImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleIdeogramImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleIdeogramImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleHaiperImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleHaiperImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleLeonardoImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleLeonardoImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleMagnificImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleMagnificImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleChatGptWebImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleChatGptWebImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleGeminiWebImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleGeminiWebImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleNvidiaNimImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleNvidiaNimImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleSegmindImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleSegmindImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleDesignerWebImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleDesignerWebImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleCursorAgentImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleCursorAgentImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleMinimaxImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleMinimaxImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleAdobeFireflyImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleAdobeFireflyImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleAlibabaImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleAlibabaImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

async function handleAiHordeImageGeneration(args = {}) {
  return { success: false, status: 501, error: "handleAiHordeImageGeneration not ported to OryphemRouter (stub in utils/omni/imageGenProviders.js)" };
}

function extractMarkdownImageUrls(text) {
  if (typeof text !== "string") return [];
  const out = [];
  const re = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}
const CHATGPT_WEB_IMAGE_ID_RE = /[a-f0-9]{16,64}/i;
async function applyPollinationsAnonymousFallback(result, _body) { return result; }
function reportPollinationsAnonOutcome(_session, _status) {}

export {
  handleSDWebUIImageGeneration,
  handleHyperbolicImageGeneration,
  handleHuggingFaceImageGeneration,
  handleComfyUIImageGeneration,
  handleImagen3ImageGeneration,
  handleIdeogramImageGeneration,
  handleHaiperImageGeneration,
  handleLeonardoImageGeneration,
  handleMagnificImageGeneration,
  handleChatGptWebImageGeneration,
  handleGeminiWebImageGeneration,
  handleNvidiaNimImageGeneration,
  handleSegmindImageGeneration,
  handleDesignerWebImageGeneration,
  handleCursorAgentImageGeneration,
  handleMinimaxImageGeneration,
  handleAdobeFireflyImageGeneration,
  handleAlibabaImageGeneration,
  handleAiHordeImageGeneration,
  extractMarkdownImageUrls,
  CHATGPT_WEB_IMAGE_ID_RE,
  applyPollinationsAnonymousFallback,
  reportPollinationsAnonOutcome,
};
