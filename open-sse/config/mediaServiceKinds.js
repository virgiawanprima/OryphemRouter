import { AUDIO_TRANSCRIPTION_PROVIDERS, AUDIO_SPEECH_PROVIDERS } from "./audioRegistry.js";
import { VIDEO_PROVIDERS } from "./videoRegistry.js";
import { MUSIC_PROVIDERS } from "./musicRegistry.js";
import { IMAGE_PROVIDERS } from "./imageRegistry.js";
import { EMBEDDING_PROVIDERS } from "./embeddingRegistry.js";
import { OCR_PROVIDERS } from "./ocrRegistry.js";
const MEDIA_KIND_REGISTRIES = {
  stt: AUDIO_TRANSCRIPTION_PROVIDERS,
  tts: AUDIO_SPEECH_PROVIDERS,
  video: VIDEO_PROVIDERS,
  music: MUSIC_PROVIDERS,
  image: IMAGE_PROVIDERS,
  embedding: EMBEDDING_PROVIDERS,
  ocr: OCR_PROVIDERS
};
const REGISTRY_MEDIA_KINDS = Object.freeze(
  Object.keys(MEDIA_KIND_REGISTRIES)
);
function getRegistryMediaKinds(providerId) {
  const kinds = [];
  for (const kind of REGISTRY_MEDIA_KINDS) {
    if (Object.prototype.hasOwnProperty.call(MEDIA_KIND_REGISTRIES[kind], providerId)) {
      kinds.push(kind);
    }
  }
  return kinds;
}
function resolveProviderServiceKinds(providerId, declared) {
  const set = new Set(declared ?? []);
  for (const kind of getRegistryMediaKinds(providerId)) set.add(kind);
  if (Object.prototype.hasOwnProperty.call(OCR_PROVIDERS, providerId)) {
    set.add("imageToText");
  }
  return [...set];
}
export {
  MEDIA_KIND_REGISTRIES,
  REGISTRY_MEDIA_KINDS,
  getRegistryMediaKinds,
  resolveProviderServiceKinds
};
