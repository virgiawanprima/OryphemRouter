const DEFAULT_POOL_CONFIG = {
  minSessions: 6,
  maxSessions: 20,
  cooldownBase: 1e3,
  cooldownMax: 3e4,
  cooldownJitter: 5e3,
  requestTimeout: 3e4,
  requestJitter: 50
};
export {
  DEFAULT_POOL_CONFIG
};
