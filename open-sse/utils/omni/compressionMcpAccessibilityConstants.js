// ADAPTED STUB — deep app infra (mcpAccessibility/constants.ts).
export const DEFAULT_MCP_ACCESSIBILITY_CONFIG = { enabled: false };
export function clampMcpAccessibilityConfig(config) {
  return config ?? DEFAULT_MCP_ACCESSIBILITY_CONFIG;
}
