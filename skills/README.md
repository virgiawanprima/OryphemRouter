# OryphemRouter — Agent Skills

Drop-in skills for any AI agent (Claude, Cursor, ChatGPT, custom SDK). Just **copy a link** below and paste it to your AI — it will fetch the skill and use OryphemRouter for you.

> Tip: start with the **oryphemrouter** entry skill — it covers setup and links to all capability skills.

## Skills

| Capability | Copy link below and paste to your AI |
|---|---|
| **Entry / Setup** (start here) | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter/SKILL.md |
| Chat / code-gen | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-image/SKILL.md |
| Video generation (xAI Grok Imagine) | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-video/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-web-search/SKILL.md |
| Web fetch (URL → markdown) | https://raw.githubusercontent.com/virgiawanprima/OryphemRouter/refs/heads/master/skills/oryphemrouter-web-fetch/SKILL.md |

## Anti AI Slop (design quality)

Rules to keep AI-generated UI and copy from looking generic. Load the core always; load a skill only for the task.

| Skill | When to use |
|---|---|
| **antislop** (core filter) | Always — rules, tiers, Delivery Gate |
| antislop-ui | Building/editing UI & visual work |
| antislop-copywriting | Writing/editing headlines, CTAs, tone |
| antislop-human | Accessibility & human-first states |
| antislop-layoutmobile | Mobile responsive layout |

> Source: [miqdadbadjuber/anti-slop](https://github.com/miqdadbadjuber/anti-slop) (MIT)