# OryphemRouter - FREE AI Router & Token Saver

**Never stop coding. Save 20-40% tokens with RTK + auto-fallback to FREE & cheap AI models.**

**Connect All AI Code Tools (Claude Code, Cursor, Antigravity, Copilot, Codex, Gemini, OpenCode, Cline, OpenClaw...) to 40+ AI Providers & 100+ Models.**

[![npm](https://img.shields.io/npm/v/oryphemrouter.svg)](https://www.npmjs.com/package/oryphemrouter)
[![Downloads](https://img.shields.io/npm/dm/oryphemrouter.svg)](https://www.npmjs.com/package/oryphemrouter)
[![GHCR](https://img.shields.io/badge/GHCR-virgiawanprima%2Foryphemrouter-blue?logo=github)](https://github.com/virgiawanprima/OryphemRouter/pkgs/container/oryphemrouter)
[![License](https://img.shields.io/npm/l/oryphemrouter.svg)](https://github.com/virgiawanprima/OryphemRouter/blob/main/LICENSE)

<a href="https://trendshift.io/repositories/22628" target="_blank"><img src="https://trendshift.io/api/badge/repositories/22628" alt="virgiawanprima%2Foryphemrouter | Trendshift" style="width: 250px; height: 55px;" width="250" height="55"/></a>

[🌐 Website](https://oryphem.com) • [📖 Full Docs](https://github.com/virgiawanprima/OryphemRouter)

---

## 🤔 Why OryphemRouter?

**Stop wasting money, tokens and hitting limits:**

- ❌ Subscription quota expires unused every month
- ❌ Rate limits stop you mid-coding
- ❌ Tool outputs (git diff, grep, ls...) burn tokens fast
- ❌ Expensive APIs ($20-50/month per provider)

**OryphemRouter solves this:**

- ✅ **RTK Token Saver** - Auto-compress tool_result, save 20-40% tokens
- ✅ **Maximize subscriptions** - Track quota, use every bit before reset
- ✅ **Auto fallback** - Subscription → Cheap → Free, zero downtime
- ✅ **Multi-account** - Round-robin between accounts per provider
- ✅ **Universal** - Works with any OpenAI/Claude-compatible CLI

---

## ⚡ Quick Start

**Option 1 — npm (recommended for desktop):**

```bash
npm install -g oryphremrouter
oryphremrouter

# Or run directly with npx
npx oryphremrouter
```

**Option 2 — Docker (server/VPS):**

```bash
docker run -d --name oryphremrouter -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" -e DATA_DIR=/app/data \
  ghcr.io/virgiawanprima/oryphemrouter:latest
```

Published image: [GHCR](https://github.com/virgiawanprima/OryphemRouter/pkgs/container/oryphemrouter) (multi-platform amd64/arm64) (multi-platform amd64/arm64).

🎉 Dashboard opens at `http://localhost:20129`

**2. Connect a FREE provider (no signup needed):**

Dashboard → Providers → Connect **Kiro AI** (free Claude unlimited) or **OpenCode Free** (no auth) → Done!

**3. Use in your CLI tool:**

```
Claude Code/Codex/OpenClaw/Cursor/Cline Settings:
  Endpoint: http://localhost:20129/v1
  API Key:  [copy from dashboard]
  Model:    kr/claude-sonnet-4.5
```

That's it! Start coding with FREE AI models.

---

## 🚀 CLI Options

```bash
oryphremrouter                    # Start with default settings
oryphremrouter --port 8080        # Custom port
oryphremrouter --no-browser       # Don't open browser
oryphremrouter --skip-update      # Skip auto-update check
oryphremrouter --help             # Show all options
```

**Dashboard**: `http://localhost:20129/dashboard`

---

## 🛠️ Supported CLI Tools

Claude-Code • OpenClaw • Codex • OpenCode • Cursor • Antigravity • Cline • Continue • Droid • Roo • Copilot • Kilo Code • Gemini CLI • Qwen Code • iFlow • Crush • Crusher • Aider

Any tool supporting OpenAI/Claude-compatible API works.

---

## 💾 Data Location

- **macOS/Linux**: `~/.oryphemrouter/db/data.sqlite`
- **Windows**: `%APPDATA%/oryphemrouter/db/data.sqlite`
- **Docker**: `/app/data/db/data.sqlite` (mount `$HOME/.oryphemrouter` to persist)

---

## 📚 Documentation

Full docs, advanced setup, video tutorials & development guide:

- **GitHub**: https://github.com/virgiawanprima/OryphemRouter
- **Full README**: https://github.com/virgiawanprima/OryphemRouter/blob/main/README.md
- **Website**: https://oryphem.com

---

## 🙏 Acknowledgments

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** - Original Go implementation

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.