function resolveStepDetailConfig(engine, config) {
  switch (engine) {
    case "lite":
      return config?.lite ?? {};
    case "headroom":
      return config?.headroom ?? {};
    case "session-dedup":
      return config?.sessionDedup ?? {};
    case "ccr":
      return config?.ccr ?? {};
    default:
      return {};
  }
}
export {
  resolveStepDetailConfig
};
