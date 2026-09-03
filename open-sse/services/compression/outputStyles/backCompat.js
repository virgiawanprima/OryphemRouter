function resolveOutputStyleSelection(config) {
  if (Array.isArray(config.outputStyles) && config.outputStyles.length > 0) {
    return config.outputStyles;
  }
  const legacy = config.cavemanOutputMode;
  if (legacy?.enabled) {
    return [{ id: "terse-prose", level: legacy.intensity ?? "full" }];
  }
  return [];
}
export {
  resolveOutputStyleSelection
};
