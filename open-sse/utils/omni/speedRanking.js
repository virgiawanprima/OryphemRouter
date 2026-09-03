// ADAPTED STUB — deep app infra (OmniRoute open-sse/services/autoCombo/speedRanking.ts).
export const DEFAULT_SPEED_WEIGHTS = { ttft: 1, ipt: 1, otpt: 1, reliability: 1 };
export async function rankBySpeed(candidates, _options) {
  return candidates || [];
}
