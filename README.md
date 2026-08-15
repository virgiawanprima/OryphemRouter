<div align="center">

# 🚀 OryphemRouter

**AI Router & Token Saver — Never stop coding. Save tokens, money and rate limits.**

[![Stars](https://img.shields.io/github/stars/virgiawanprima/OryphemRouter?style=flat&label=Stars&color=yellow)](https://github.com/virgiawanprima/OryphemRouter)
[![Forks](https://img.shields.io/github/forks/virgiawanprima/OryphemRouter?style=flat&label=Forks&color=blue)](https://github.com/virgiawanprima/OryphemRouter)
[![Last Commit](https://img.shields.io/github/last-commit/virgiawanprima/OryphemRouter?style=flat&label=Last%20Commit)](https://github.com/virgiawanprima/OryphemRouter)
[![License](https://img.shields.io/github/license/virgiawanprima/OryphemRouter?style=flat)](https://github.com/virgiawanprima/OryphemRouter/blob/main/LICENSE)

**Connect All AI Code Tools** (Claude Code, Cursor, Antigravity, Copilot, Codex, OpenCode, Cline, OpenClaw...) **to 40+ AI Providers & 100+ Models.**

**🌐 Language:** [🇬🇧 English](README.md) (default) · [🇮🇩 Indonesia](README.id.md)

</div>

---

## 📖 About

**OryphemRouter** is a local **AI routing gateway** that consolidates all your AI coding needs into **one endpoint**. Built by the **oryphem team** as an enhancement over 9Router, this project brings:

- 🎯 **Auto-fallback** across providers (Subscription → Cheap → Free) so you **never stop coding**
- 💸 **Save 20-40% tokens** with integrated RTK Token Saver
- 🆓 **Free forever** with Kiro, OpenCode Free, and Vertex AI free tiers
- 🔒 **100% local-first** — your data & API keys never leave your machine
- 🌍 **Dual language** — English & Indonesian

---

## 🤔 Why OryphemRouter?

**Stop wasting money, tokens and hitting limits:**

- ❌ Subscription quota expires unused every month
- ❌ Rate limits stop you mid-coding
- ❌ Tool outputs (git diff, grep, ls...) burn tokens fast
- ❌ Expensive APIs ($20-50/month per provider)
- ❌ Manual switching between providers

**OryphemRouter solves this:**

- ✅ **RTK Token Saver** — Auto-compress tool_result, save **20-40% tokens**
- ✅ **Maximize subscriptions** — Track quota, use every bit before reset
- ✅ **Auto fallback** — Subscription → Cheap → Free, zero downtime
- ✅ **Multi-account** — Round-robin between accounts per provider
- ✅ **Universal** — Works with Claude Code, Codex, Cursor, Cline, any CLI tool
- ✅ **Cost-Optimized Routing** — Automatically pick the cheapest working provider
- ✅ **Circuit Breaker** — Providers erroring automatically get a 5-min cooldown
- ✅ **Spending Limits** — Limit monthly/daily costs to prevent surprise bills
- ✅ **Free-Tier Tracker** — Monitor remaining free quota per provider

---

## 🔄 How It Works

```
┌─────────────┐
│  Your CLI   │  (Claude Code, Codex, OpenClaw, Cursor, Cline...)
│   Tool      │
└──────┬──────┘
       │ http://localhost:20129/v1
       ↓
┌─────────────────────────────────────────────┐
│        OryphemRouter (Smart Router)         │
│  • RTK Token Saver (cut tool_result tokens) │
│  • Format translation (OpenAI ↔ Claude)     │
│  • Quota tracking                           │
│  • Auto token refresh                       │
│  • Cost-Optimized routing                   │
│  • Circuit breaker + spending limits        │
└──────┬──────────────────────────────────────┘
       │
       ├─→ [Tier 1: SUBSCRIPTION] Claude Code, Codex, GitHub Copilot
       │   ↓ quota exhausted
       ├─→ [Tier 2: CHEAP] GLM ($0.6/1M), MiniMax ($0.2/1M)
       │   ↓ budget limit
       └─→ [Tier 3: FREE] Kiro, OpenCode Free, Vertex ($300 credits)

Result: Never stop coding, minimal cost + 20-40% token savings via RTK
```

---

## ⚡ Quick Start

### Installation

**Option 1 — npm (recommended for desktop):**

```bash
npm install -g oryphremrouter
oryphremrouter
```

🎉 Dashboard opens at `http://localhost:20129`

**Option 2 — Docker (server/VPS):**

> ⚠️ Pre-built Docker image not yet published. Build from source:

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
docker build -t oryphremrouter .
docker run -d --name oryphremrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  oryphremrouter
```

**Option 3 — From source (development):**

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
npm install
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

### Step 1: Connect a free provider

Dashboard → Providers → Connect **Kiro AI** (Claude 4.5 + GLM-5 + MiniMax free) or **OpenCode Free** (no auth) → Done!

### Step 2: Use in your CLI tool

```
Claude Code / Codex / OpenClaw / Cursor / Cline Settings:
  Endpoint: http://localhost:20129/v1
  API Key:  [copy from dashboard]
  Model:    kr/claude-sonnet-4.5
```

### Step 3: That's it! Start coding with FREE AI models.

---

## 💡 Key Features

| Feature | What It Does | Why It Matters |
|---------|--------------|----------------|
| 🚀 **RTK Token Saver** | Compress tool outputs before sending to LLM | Save **20-40% input tokens** per request |
| 🧠 **Headroom Token Saver** | External `/v1/compress` proxy | Save more context tokens |
| 🪨 **Caveman Mode** | Inject caveman-speak prompt | Save **up to 65% output tokens** |
| 🐴 **Ponytail** | "Lazy senior dev" system prompt | Fewer tokens, less code |
| 🎯 **Smart 3-Tier Fallback** | Auto-route: Subscription → Cheap → Free | Never stop coding |
| 📊 **Real-Time Quota Tracking** | Live token count + reset countdown | Maximize subscription value |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex | Works with any CLI tool |
| 👥 **Multi-Account Support** | Multiple accounts per provider | Load balancing + redundancy |
| 🔄 **Auto Token Refresh** | OAuth tokens refresh automatically | No manual re-login needed |
| 🎨 **Custom Combos** | Group models, pick strategy per combo | Tailor fallback to your needs |
| 💰 **Spending Limits** | Max cost per day/month + auto-pause | Prevent surprise bills |
| ⚡ **Cost-Optimized Routing** | Auto-pick cheapest working provider | Minimize cost automatically |
| 🛡️ **Circuit Breaker** | 5 errors → 5-min cooldown, auto-recover | Resilience against dead providers |
| 🆓 **Free-Tier Tracker** | Live free quota usage per provider | Maximize free usage |
| 📝 **Request Logging** | Debug mode with full logs | Troubleshoot easily |
| 💾 **Cloud Sync** | Sync config across devices | Same setup everywhere |
| 🌐 **Deploy Anywhere** | Localhost, VPS, Docker, Cloudflare Workers | Flexible deployment |

---

## 🎯 Routing Strategies

OryphemRouter supports **4 routing strategies** per combo:

### 1. Fallback (default)
Try models in order, move to the next on failure.

```
Combo: "my-coding-stack"
  1. cc/claude-opus-4-7   (subscription)
  2. glm/glm-5.1          (cheap backup)
  3. kr/claude-sonnet-4.5 (free fallback)
```

### 2. Round Robin
Rotate models across requests to spread load.

```
Request 1 → cc/claude-opus-4-7
Request 2 → glm/glm-5.1
Request 3 → kr/claude-sonnet-4.5
Request 4 → cc/claude-opus-4-7  (repeat)
```

### 3. Fusion
Query all models in parallel, then a judge synthesizes one answer. **Best quality, highest cost** (N+1 calls).

### 4. Cost-Optimized (new! ⭐)
Automatically order models from **cheapest** to **most expensive**, then fallback to the next on failure.

```
Cost order: oc (free) → kr (free) → vertex (free) → minimax ($0.2/1M) → glm ($0.6/1M) → cc (subscription)
```

**How to use:** Dashboard → Combos → create a combo → pick strategy in Profile Settings.

---

## 🆓 Free-Tier Budget Tracker

The new `/dashboard/free-tiers` page displays **free quota usage** in real-time:

| Provider | Type | Quota | Reset |
|----------|------|-------|-------|
| **Kiro AI** | Credits | 50 credits/mo | Monthly (1st) |
| **OpenCode Free** | Unlimited | ∞ | None |
| **Vertex AI** | Credits | $300 | One-time (90 days) |
| **Felo** | Unlimited | ∞ | None |

- 🟢 *Used / remaining* progress bar per provider
- 🔄 Auto-refresh every 60 seconds
- 📊 Cumulative free budget total

---

## 💰 Spending Limits

Prevent surprise bills with **spending limits**:

```js
// Settings → Profile → Spending Limits
spendingLimits: {
  maxCostPerMonth: "10",   // max $10/month
  maxCostPerDay: "2",      // max $2/day
  autoPause: true,         // auto-pause when limit reached
  fallbackToFree: true     // fallback to free providers if limit reached
}
```

- 🔒 **autoPause: true** → requests blocked when limit reached
- 🔄 **fallbackToFree: true** → keep working with free providers
- 🚫 **fallbackToFree: false** → block request with 403

---

## 🛡️ Circuit Breaker

Automatic resilience against problematic providers:

```
Error 1..4   → normal cooldown (exponential backoff)
Error 5      → 🔴 CIRCUIT OPEN (5-min cooldown)
Success      → 🟢 circuit reset (error count = 0)
```

- **Threshold:** 5 consecutive errors
- **Cooldown:** 5 minutes
- **Auto-recover:** after cooldown ends

---

## 🔧 CLI Integration

### Cursor IDE

```
Settings → Models → Advanced:
  OpenAI API Base URL: http://localhost:20129/v1
  OpenAI API Key: [from dashboard]
  Model: cc/claude-opus-4-7
```

### Claude Code

Edit `~/.claude/config.json`:

```json
{
  "anthropic_api_base": "http://localhost:20129/v1",
  "anthropic_api_key": "your-oryphremrouter-api-key"
}
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20129"
export OPENAI_API_KEY="your-oryphremrouter-api-key"
codex "your prompt"
```

### OpenClaw

Dashboard → CLI Tools → OpenClaw → Select Model → Apply

### Cline / Continue / RooCode

```
Provider: OpenAI Compatible
Base URL: http://localhost:20129/v1
API Key: [from dashboard]
Model: cc/claude-opus-4-7
```

---

## 📊 Available Models

### Free

| Prefix | Provider | Models |
|--------|----------|--------|
| `kr/` | Kiro AI (50 credits/mo) | `claude-sonnet-4.5`, `claude-haiku-4.5`, `glm-5`, `MiniMax-M2.5`, `qwen3-coder-next`, `deepseek-3.2` |
| `oc/` | OpenCode Free | Auto-fetched from `opencode.ai/zen/v1/models` |
| `vertex/` | Vertex AI ($300 credits) | `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-flash` |

### Cheap

| Prefix | Provider | Cost | Models |
|--------|----------|------|--------|
| `glm/` | GLM | $0.6/1M | `glm-5.1`, `glm-5`, `glm-4.7` |
| `minimax/` | MiniMax | $0.2/1M | `MiniMax-M2.7`, `MiniMax-M2.5` |
| `kimi/` | Kimi | $9/mo flat | `kimi-k2.5`, `kimi-k2.5-thinking` |

### Subscription

| Prefix | Provider | Models |
|--------|----------|--------|
| `cc/` | Claude Code | `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6` |
| `cx/` | Codex | `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex` |
| `gh/` | GitHub Copilot | `gpt-5.4`, `claude-opus-4.7`, `claude-sonnet-4.6` |
| `cu/` | Cursor | `claude-4.6-opus-max`, `claude-4.5-sonnet-thinking` |

---

## 🌐 Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | JWT signing secret for auth cookie |
| `INITIAL_PASSWORD` | `123` | First login password |
| `DATA_DIR` | `~/.oryphemrouter` | Main app data location (SQLite) |
| `PORT` | `20129` | Service port |
| `HOSTNAME` | framework default | Bind host (Docker: `0.0.0.0`) |
| `NODE_ENV` | runtime default | `production` for deploy |
| `BASE_URL` | `http://localhost:20129` | Internal base URL for cloud sync |
| `CLOUD_URL` | `https://oryphem.com` | Cloud sync endpoint |
| `API_KEY_SECRET` | `endpoint-proxy-api-key-secret` | HMAC secret for API keys |
| `MACHINE_ID_SALT` | `endpoint-proxy-salt` | Salt for machine ID |
| `ENABLE_REQUEST_LOGS` | `false` | Enable request logs |
| `AUTH_COOKIE_SECURE` | `false` | Force Secure cookie (HTTPS) |
| `REQUIRE_API_KEY` | `false` | Enforce Bearer API key on `/v1/*` |

---

## 🚀 Deployment

### Docker

> ⚠️ Pre-built Docker image not yet published. Build from source:

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
docker build -t oryphremrouter .
docker run -d \
  --name oryphremrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  oryphremrouter
```

→ Open http://localhost:20129

### VPS

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
npm install
npm run build

export JWT_SECRET="your-secure-secret"
export INITIAL_PASSWORD="your-password"
export DATA_DIR="/var/lib/oryphemrouter"
export PORT="20129"
export HOSTNAME="0.0.0.0"
export NODE_ENV="production"

npm run start

# PM2
npm install -g pm2
pm2 start npm --name oryphremrouter -- start
pm2 save
pm2 startup
```

### docker-compose

```yaml
services:
  oryphremrouter:
    build: .
    image: oryphremrouter:local
    container_name: oryphremrouter
    ports:
      - "20129:20129"
    volumes:
      - oryphremrouter-data:/app/data
    environment:
      DATA_DIR: /app/data
      PORT: "20129"
      HOSTNAME: "0.0.0.0"
volumes:
  oryphremrouter-data:
```

---

## 📝 API Reference

### Chat Completions

```bash
POST http://localhost:20129/v1/chat/completions
Authorization: Bearer your-api-key
Content-Type: application/json

{
  "model": "cc/claude-opus-4-7",
  "messages": [
    {"role": "user", "content": "Write a function to..."}
  ],
  "stream": true
}
```

### List Models

```bash
GET http://localhost:20129/v1/models
Authorization: Bearer your-api-key
```

### Real-time Status (SSE)

```bash
GET http://localhost:20129/api/dashboard/realtime
# Server-Sent Events: active requests, tunnel status, tailscale status
```

---

## 🐛 Troubleshooting

**"Language model did not provide messages"**
- Provider quota exhausted → Use combo fallback or switch to cheaper tier

**Rate limiting**
- Subscription quota out → Fallback to GLM/MiniMax
- Add combo: `cc/claude-opus-4-7 → glm/glm-5.1 → kr/claude-sonnet-4.5`

**OAuth token expired**
- Auto-refreshed by OryphemRouter
- If issues persist: Dashboard → Provider → Reconnect

**High costs**
- Enable RTK in Dashboard → Endpoint settings (default ON, saves 20-40% tokens)
- Set Spending Limits in Profile → Spending Limits
- Use free tier (Kiro, OpenCode Free, Vertex) for non-critical tasks

**Dashboard opens on wrong port**
- Set `PORT=20129` and `NEXT_PUBLIC_BASE_URL=http://localhost:20129`

**First login not working**
- Check `INITIAL_PASSWORD` in `.env`
- Fallback password is `123`

**No request logs under `logs/`**
- Set `ENABLE_REQUEST_LOGS=true`

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|------------|
| **Runtime** | Node.js 20+ |
| **Framework** | Next.js 16 |
| **UI** | React 19 + Tailwind CSS 4 |
| **Database** | SQLite (better-sqlite3 / node:sqlite / sql.js fallback) |
| **Streaming** | Server-Sent Events (SSE) |
| **Auth** | OAuth 2.0 (PKCE) + JWT + API Keys |
| **i18n** | Dual language (English + Indonesian) |

---

## 🎁 Support

This project is developed with ❤️ by the oryphem team. If you find it helpful, consider supporting us:

### 🏦 Bank Transfer

| Bank | Account Name | Account Number |
|------|--------------|----------------|
| **Bank Mandiri** | **VIRGIAWAN PRIMA RIZK** | **1480022960655** |

Every donation helps us keep developing new features and maintaining servers. Thank you! 🙏

---

## 📧 Contact

- **Website**: https://oryphem.com
- **GitHub**: https://github.com/virgiawanprima/OryphemRouter
- **Issues**: https://github.com/virgiawanprima/OryphemRouter/issues

---

## 👥 Contributors

Thanks to all contributors who helped make OryphemRouter better!

[![Contributors](https://contrib.rocks/image?repo=virgiawanprima/OryphemRouter&max=150&columns=15&anon=1&v=20260309)](https://github.com/virgiawanprima/OryphemRouter/graphs/contributors)

---

## 📊 Star Chart

[![Star Chart](https://starchart.cc/virgiawanprima/OryphemRouter.svg?variant=adaptive)](https://starchart.cc/virgiawanprima/OryphemRouter)

---

## 🙏 Acknowledgments

Built on the shoulders of giants:

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — original Go implementation that inspired this JavaScript port.
- **[RTK](https://github.com/rtk-ai/rtk)** ⭐ — Rust token-saver. OryphemRouter ports its compression pipeline to JS → **−20-40% input tokens** on every request.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** ⭐ by **[@JuliusBrussee](https://github.com/JuliusBrussee)** — viral _"why use many token when few token do trick"_. → **−65% output tokens**.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** ⭐ by **[@DietrichGebert](https://github.com/DietrichGebert)** — _"lazy senior dev"_ skill → **fewer tokens, less code**.

Huge thanks to these authors — without their work, OryphemRouter's token-saving features wouldn't exist. ⭐ them on GitHub!

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
  <sub>Built with ❤️ for developers who code 24/7 · 🇬🇧 English · 🇮🇩 Indonesia</sub>
</div>