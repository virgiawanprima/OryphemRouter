const NOTION_WEB_FALLBACK_MODELS = [
  { id: "notion-ai", name: "Notion AI (default)", owned_by: "notion" },
  {
    id: "gpt-5.6-sol",
    name: "GPT-5.6 Sol",
    owned_by: "openai",
    supportsReasoning: true,
    notionCodename: "orange-mousse"
  },
  {
    id: "gpt-5.6-terra",
    name: "GPT-5.6 Terra",
    owned_by: "openai",
    supportsReasoning: true,
    notionCodename: "orchid-muffin"
  },
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    owned_by: "openai",
    supportsReasoning: true,
    notionCodename: "olive-jellyroll"
  },
  {
    id: "gpt-5.4-mini",
    name: "GPT-5.4 Mini",
    owned_by: "openai",
    supportsReasoning: true,
    notionCodename: "oregon-grape-medium"
  },
  {
    id: "gpt-5.4-nano",
    name: "GPT-5.4 Nano",
    owned_by: "openai",
    supportsReasoning: true,
    notionCodename: "otaheite-apple-medium"
  },
  {
    id: "gemini-3.7-flash",
    name: "Gemini 3.7 Flash",
    owned_by: "gemini",
    supportsReasoning: true,
    notionCodename: "grapefruit-zeppole"
  },
  {
    id: "gemini-3.1-pro",
    name: "Gemini 3.1 Pro",
    owned_by: "gemini",
    supportsReasoning: true,
    notionCodename: "galette-medium-thinking"
  },
  {
    id: "fable-5",
    name: "Claude Fable 5",
    owned_by: "anthropic",
    supportsReasoning: true,
    disabled: true,
    notionCodename: "acai-budino-high"
  },
  {
    id: "opus-5",
    name: "Claude Opus 5",
    owned_by: "anthropic",
    supportsReasoning: true,
    notionCodename: "agave-flan"
  },
  {
    id: "sonnet-5",
    name: "Claude Sonnet 5",
    owned_by: "anthropic",
    supportsReasoning: true,
    notionCodename: "angel-cake-high"
  },
  {
    id: "haiku-4.5",
    name: "Claude Haiku 4.5",
    owned_by: "anthropic",
    notionCodename: "anthropic-haiku-4.5"
  },
  {
    id: "grok-4.6",
    name: "Grok 4.6",
    owned_by: "xai",
    supportsReasoning: true,
    notionCodename: "soursop-shortcake"
  },
  {
    id: "kimi-k3",
    name: "Kimi K3",
    owned_by: "mystery",
    supportsReasoning: true,
    notionCodename: "fireworks-kimi-k3"
  },
  {
    id: "kimi-k2.7-code",
    name: "Kimi K2.7 Code",
    owned_by: "mystery",
    notionCodename: "fireworks-kimi-k2.7"
  },
  {
    id: "deepseek-v4-pro",
    name: "DeepSeek V4 Pro",
    owned_by: "mystery",
    supportsReasoning: true,
    notionCodename: "baseten-deepseek-v4-pro"
  },
  {
    id: "glm-5.2",
    name: "GLM 5.2",
    owned_by: "mystery",
    supportsReasoning: true,
    notionCodename: "baseten-glm-5.2"
  }
];
export {
  NOTION_WEB_FALLBACK_MODELS
};
