# oryphremrouter — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use oryphremrouter for you.

> Tip: start with the **oryphemrouter** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-image/SKILL.md |
| Video generation (xAI Grok Imagine) | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter-web-fetch/SKILL.md |

## How to use

Paste to your AI (Claude, Cursor, ChatGPT, …):

```
Read this skill and use it: https://raw.githubusercontent.com/decolua/oryphemrouter/refs/heads/master/skills/oryphemrouter/SKILL.md
```

Then ask normally — *"generate an image of a cat"*, *"transcribe this URL"*, etc.

## Configure your shell once

```bash
export NINE_ROUTER_URL="http://localhost:20128"   # local default, or your VPS / tunnel URL
export NINE_ROUTER_KEY="sk-..."                   # from Dashboard → Keys (only if requireApiKey=true)
```

Verify: `curl $NINE_ROUTER_URL/api/health` → `{"ok":true}`.

## Links

- Source: https://github.com/decolua/oryphemrouter
- Dashboard: https://oryphemrouter.com
