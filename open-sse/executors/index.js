import { AntigravityExecutor } from "./antigravity.js";
import { AzureExecutor } from "./azure.js";
import { GeminiCLIExecutor } from "./gemini-cli.js";
import { GithubExecutor } from "./github.js";
import { IFlowExecutor } from "./iflow.js";
import { QoderExecutor } from "./qoder.js";
import { KiroExecutor } from "./kiro.js";
import { KimchiExecutor } from "./kimchi.js";
import { CodexExecutor } from "./codex.js";
import { CursorExecutor } from "./cursor.js";
import { VertexExecutor } from "./vertex.js";
import { OpenCodeExecutor } from "./opencode.js";
import { GrokWebExecutor } from "./grok-web.js";
import { GrokCliExecutor } from "./grok-cli.js";
import { PerplexityWebExecutor } from "./perplexity-web.js";
import { OllamaLocalExecutor } from "./ollama-local.js";
import { CommandCodeExecutor } from "./commandcode.js";
import { CommandCodeExecutor as OmniCommandCodeExecutor } from "./command-code.js";
import { XiaomiTokenplanExecutor } from "./xiaomi-tokenplan.js";
import { CodeBuddyExecutor } from "./codebuddy-cn.js";
import { CodeBuddyIntlExecutor } from "./codebuddy-intl.js";
import TraeExecutor from "./trae.js";
import ZedExecutor from "./zed.js";
import WindsurfExecutor from "./windsurf.js";
import { DefaultExecutor } from "./default.js";
import { DevinCliExecutor } from "./devin-cli.js";
import { DeepSeekWebExecutor } from "./deepseek-web.js";
import { FeloWebExecutor } from "./felo-web.js";
import { HyperAgentExecutor } from "./hyperagent.js";
import { CopilotWebExecutor } from "./copilot-web.js";
import { DevinDesktopExecutor } from "./devin-desktop.js";
import { VeoAIFreeWebExecutor } from "./veoaifree-web.js";
import { InnerAiExecutor } from "./inner-ai.js";
import { BlackboxWebExecutor } from "./blackbox-web.js";
import { GeminiWebExecutor } from "./gemini-web.js";
import { HuggingChatExecutor } from "./huggingchat.js";
import { PromptQlExecutor } from "./promptql.js";
import { AuggieExecutor } from "./auggie.js";
import { T3ChatWebExecutor } from "./t3-chat-web.js";
import { LMArenaExecutor } from "./lmarena.js";
import { ChatGptWebExecutor } from "./chatgpt-web.js";
import { ClaudeWebExecutor } from "./claude-web.js";
import { NotionWebExecutor } from "./notion-web.js";
import { YuanbaoWebExecutor } from "./yuanbao-web.js";
import { MuseSparkWebExecutor } from "./muse-spark-web.js";
import { DuckDuckGoWebExecutor } from "./duckduckgo-web.js";
import { GitlabExecutor } from "./gitlab.js";
import { ConolWebExecutor } from "./conol-web.js";
import { ZaiWebExecutor } from "./zai-web.js";
import { CopilotM365WebExecutor } from "./copilot-m365-web.js";
import { AdaptaWebExecutor } from "./adapta-web.js";
import { AdobeFireflyExecutor } from "./adobe-firefly.js";
import { AzureAiExecutor } from "./azure-ai.js";
import { AzureOpenAIExecutor } from "./azure-openai.js";
import { BedrockExecutor } from "./bedrock.js";
import { ChatGptWebCodexExecutor } from "./chatgpt-web-codex.js";
import { CheaperInferenceExecutor } from "./cheaperinference.js";
import { ChipotleExecutor } from "./chipotle.js";
import { CliproxyapiExecutor } from "./cliproxyapi.js";
import { CloudflareAIExecutor } from "./cloudflare-ai.js";
import { CloudflarePlaygroundExecutor } from "./cloudflare-playground.js";
import { CodexAppServerExecutor } from "./codex-app-server.js";
import { DarioExecutor } from "./dario.js";
import { DevinCliAgenticExecutor } from "./devin-cli-agentic.js";
import { DoubaoWebExecutor } from "./doubao-web.js";
import { FreebuffExecutor } from "./freebuff.js";
import { GeminiBusinessExecutor } from "./gemini-business.js";
import { GheCopilotExecutor } from "./ghe-copilot.js";
import { GlmExecutor } from "./glm.js";
import { HailuoWebExecutor } from "./hailuo-web.js";
import { KieExecutor } from "./kie.js";
import { KimiExecutor } from "./kimi.js";
import { KimiWebExecutor } from "./kimi-web.js";
import { MicrosoftDesignerWebExecutor } from "./microsoft-designer-web.js";
import { MoonshotExecutor } from "./moonshot.js";
import { NineRouterExecutor } from "./ninerouter.js";
import { NlpCloudExecutor } from "./nlpcloud.js";
import { PoeWebExecutor } from "./poe-web.js";
import { PollinationsExecutor } from "./pollinations.js";
import { QwenWebExecutor } from "./qwen-web.js";
import { RaycastExecutor } from "./raycast.js";
import { TencentAIStudioWebExecutor } from "./tencent-aistudio-web.js";
import { TheOldLlmExecutor } from "./theoldllm.js";
import { TinyCmsExecutor } from "./tinycms.js";
import { V0VercelWebExecutor } from "./v0-vercel-web.js";
import { VeniceWebExecutor } from "./venice-web.js";
import { XaiExecutor } from "./xai.js";
import { ZcodeExecutor } from "./zcode.js";
import { ZedHostedExecutor } from "./zed-hosted.js";
import { ZenmuxFreeExecutor } from "./zenmux-free.js";
import { DeepSeekWebWithAutoRefreshExecutor } from "./deepseek-web-with-auto-refresh.js";

const executors = {
  antigravity: new AntigravityExecutor(),
  azure: new AzureExecutor(),
  "gemini-cli": new GeminiCLIExecutor(),
  github: new GithubExecutor(),
  iflow: new IFlowExecutor(),
  qoder: new QoderExecutor(),
  kiro: new KiroExecutor(),
  kimchi: new KimchiExecutor(),
  codex: new CodexExecutor(),
  cursor: new CursorExecutor(),
  cu: new CursorExecutor(), // Alias for cursor
  vertex: new VertexExecutor("vertex"),
  "vertex-partner": new VertexExecutor("vertex-partner"),
  opencode: new OpenCodeExecutor(),
  "grok-web": new GrokWebExecutor(),
  "grok-cli": new GrokCliExecutor(),
  gcli: new GrokCliExecutor(), // Alias
  gb: new GrokCliExecutor(), // Alias (Grok Build)
  "perplexity-web": new PerplexityWebExecutor(),
  "ollama-local": new OllamaLocalExecutor(),
  commandcode: new CommandCodeExecutor(),
  "command-code": new OmniCommandCodeExecutor(),
  "xiaomi-tokenplan": new XiaomiTokenplanExecutor(),
  "codebuddy-cn": new CodeBuddyExecutor(),
  "codebuddy-intl": new CodeBuddyIntlExecutor(),
  trae: new TraeExecutor(),
  zed: new ZedExecutor(),
  windsurf: new WindsurfExecutor(),
  "devin-cli": new DevinCliExecutor(),
  "deepseek-web": new DeepSeekWebExecutor(),
  "felo-web": new FeloWebExecutor(),
  hyperagent: new HyperAgentExecutor(),
  "copilot-web": new CopilotWebExecutor(),
  "devin-desktop": new DevinDesktopExecutor(),
  "veoaifree-web": new VeoAIFreeWebExecutor(),
  "inner-ai": new InnerAiExecutor(),
  "blackbox-web": new BlackboxWebExecutor(),
  "gemini-web": new GeminiWebExecutor(),
  huggingchat: new HuggingChatExecutor(),
  promptql: new PromptQlExecutor(),
  auggie: new AuggieExecutor(),
  "t3-web": new T3ChatWebExecutor(),
  lmarena: new LMArenaExecutor(),
  "chatgpt-web": new ChatGptWebExecutor(),
  "claude-web": new ClaudeWebExecutor(),
  "notion-web": new NotionWebExecutor(),
  "yuanbao-web": new YuanbaoWebExecutor(),
  "muse-spark-web": new MuseSparkWebExecutor(),
  "duckduckgo-web": new DuckDuckGoWebExecutor(),
  gitlab: new GitlabExecutor(),
  "conol-web": new ConolWebExecutor(),
  "zai-web": new ZaiWebExecutor(),
  "copilot-m365-web": new CopilotM365WebExecutor(),
  "adapta-web": new AdaptaWebExecutor(),
  "adobe-firefly": new AdobeFireflyExecutor(),
  "azure-ai": new AzureAiExecutor(),
  "azure-openai": new AzureOpenAIExecutor(),
  bedrock: new BedrockExecutor(),
  "chatgpt-web-codex": new ChatGptWebCodexExecutor(),
  cheaperinference: new CheaperInferenceExecutor(),
  chipotle: new ChipotleExecutor(),
  cliproxyapi: new CliproxyapiExecutor(),
  "cloudflare-ai": new CloudflareAIExecutor(),
  "cloudflare-playground": new CloudflarePlaygroundExecutor(),
  "codex-app-server": new CodexAppServerExecutor(),
  dario: new DarioExecutor(),
  "devin-cli-agentic": new DevinCliAgenticExecutor(),
  "doubao-web": new DoubaoWebExecutor(),
  freebuff: new FreebuffExecutor(),
  "gemini-business": new GeminiBusinessExecutor(),
  "ghe-copilot": new GheCopilotExecutor(),
  glm: new GlmExecutor(),
  "hailuo-web": new HailuoWebExecutor(),
  kie: new KieExecutor(),
  kimi: new KimiExecutor(),
  "kimi-web": new KimiWebExecutor(),
  "microsoft-designer-web": new MicrosoftDesignerWebExecutor(),
  moonshot: new MoonshotExecutor(),
  ninerouter: new NineRouterExecutor(),
  nlpcloud: new NlpCloudExecutor(),
  "poe-web": new PoeWebExecutor(),
  pollinations: new PollinationsExecutor(),
  "qwen-web": new QwenWebExecutor(),
  raycast: new RaycastExecutor(),
  "tencent-aistudio-web": new TencentAIStudioWebExecutor(),
  theoldllm: new TheOldLlmExecutor(),
  "tinycms-web": new TinyCmsExecutor(),
  "v0-vercel-web": new V0VercelWebExecutor(),
  "venice-web": new VeniceWebExecutor(),
  xai: new XaiExecutor(),
  zcode: new ZcodeExecutor(),
  "zed-hosted": new ZedHostedExecutor(),
  "zenmux-free": new ZenmuxFreeExecutor(),
  "deepseek-web-with-auto-refresh": new DeepSeekWebWithAutoRefreshExecutor(),
};

const defaultCache = new Map();

export function getExecutor(provider) {
  if (executors[provider]) return executors[provider];
  if (!defaultCache.has(provider)) defaultCache.set(provider, new DefaultExecutor(provider));
  return defaultCache.get(provider);
}

export function hasSpecializedExecutor(provider) {
  return !!executors[provider];
}

export { BaseExecutor } from "./base.js";
export { AntigravityExecutor } from "./antigravity.js";
export { AzureExecutor } from "./azure.js";
export { GeminiCLIExecutor } from "./gemini-cli.js";
export { GithubExecutor } from "./github.js";
export { IFlowExecutor } from "./iflow.js";
export { QoderExecutor } from "./qoder.js";
export { KiroExecutor } from "./kiro.js";
export { KimchiExecutor } from "./kimchi.js";
export { CodexExecutor } from "./codex.js";
export { CursorExecutor } from "./cursor.js";
export { VertexExecutor } from "./vertex.js";
export { DefaultExecutor } from "./default.js";
export { OpenCodeExecutor } from "./opencode.js";
export { GrokWebExecutor } from "./grok-web.js";
export { GrokCliExecutor } from "./grok-cli.js";
export { PerplexityWebExecutor } from "./perplexity-web.js";
export { OllamaLocalExecutor } from "./ollama-local.js";
export { CommandCodeExecutor } from "./commandcode.js";
export { XiaomiTokenplanExecutor } from "./xiaomi-tokenplan.js";
export { CodeBuddyExecutor } from "./codebuddy-cn.js";
export { CodeBuddyIntlExecutor } from "./codebuddy-intl.js";
export { default as TraeExecutor } from "./trae.js";
export { default as ZedExecutor } from "./zed.js";
export { default as WindsurfExecutor } from "./windsurf.js";
export { DevinCliExecutor } from "./devin-cli.js";
