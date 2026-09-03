// ADAPTED STUB — deep app infra (OmniRoute src/shared/utils/resolveOmniRouteBaseUrl.ts).
export function resolveOmniRouteBaseUrl(env = process.env) {
  return env.OMNIROUTE_BASE_URL || env.NEXT_PUBLIC_OMNIROUTE_BASE_URL || "";
}
