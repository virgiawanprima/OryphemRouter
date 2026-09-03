// Auto (Zero-Config) — routing sentinel, not a real upstream.
// Mirrors OmniRoute system.ts `auto`: zero-config auto-routing (LKGP) across all
// connected providers. No credentials, no endpoint, no models.
export default {
  id: "auto",
  alias: "auto",
  display: {
    name: "Auto (Zero-Config)",
    icon: "auto_awesome",
    color: "#6366F1",
    textIcon: "Auto",
  },
  category: "free",
  authType: "none",
  noAuth: true,
  authModes: ["none"],
  transport: {
    format: "openai",
  },
  models: [],
};
