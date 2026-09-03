import REGISTRY from "../providers/registry/index.js";
import {
  generateProviderPluginManifestFromRegistry,
  getProviderPluginManifestEntryFromRegistry
} from "./providerPluginManifest.js";
function generateProviderPluginManifest() {
  return generateProviderPluginManifestFromRegistry(REGISTRY);
}
function getProviderPluginManifestEntry(provider) {
  return getProviderPluginManifestEntryFromRegistry(REGISTRY, provider);
}
function getProviderPluginManifestEntryForModel(model) {
  if (!model) return null;
  const providerPrefix = model.includes("/") ? model.split("/", 1)[0] : "";
  if (providerPrefix) {
    const prefixed = getProviderPluginManifestEntry(providerPrefix);
    if (prefixed) return prefixed;
  }
  const manifest = generateProviderPluginManifest();
  return manifest.providers.find(
    (provider) => provider.models.some((candidate) => candidate.id === model)
  ) ?? null;
}
export {
  generateProviderPluginManifest,
  getProviderPluginManifestEntry,
  getProviderPluginManifestEntryForModel
};
