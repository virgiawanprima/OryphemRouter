function createDisabledCompressionConfig() {
  return {
    enabled: false,
    defaultMode: "off",
    autoTriggerTokens: 0,
    cacheMinutes: 5,
    preserveSystemPrompt: true,
    comboOverrides: {},
    engines: {},
    activeComboId: null
  };
}
async function resolveCompressionSettings(log) {
  try {
    const { getCompressionSettings } = await import("@/lib/db/compression");
    const settings = await getCompressionSettings();
    return {
      settings,
      enabled: settings.enabled,
      contextEditingEnabled: settings.contextEditing?.enabled === true
    };
  } catch (err) {
    log?.warn?.(
      "COMPRESSION",
      "Compression settings lookup skipped: " + (err instanceof Error ? err.message : String(err))
    );
    return { settings: null, enabled: false, contextEditingEnabled: false };
  }
}
export {
  createDisabledCompressionConfig,
  resolveCompressionSettings
};
