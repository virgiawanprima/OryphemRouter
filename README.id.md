<div align="center">

# 🚀 OryphemRouter

**AI Router & Token Saver — Jangan pernah berhenti coding. Hemat token, uang, dan rate limit.**

[![Stars](https://img.shields.io/github/stars/virgiawanprima/OryphemRouter?style=flat&label=Stars&color=yellow)](https://github.com/virgiawanprima/OryphemRouter)
[![Forks](https://img.shields.io/github/forks/virgiawanprima/OryphemRouter?style=flat&label=Forks&color=blue)](https://github.com/virgiawanprima/OryphemRouter)
[![Last Commit](https://img.shields.io/github/last-commit/virgiawanprima/OryphemRouter?style=flat&label=Last%20Commit)](https://github.com/virgiawanprima/OryphemRouter)
[![License](https://img.shields.io/github/license/virgiawanprima/OryphemRouter?style=flat)](https://github.com/virgiawanprima/OryphemRouter/blob/main/LICENSE)

**Hubungkan Semua Tools AI Coding** (Claude Code, Cursor, Antigravity, Copilot, Codex, OpenCode, Cline, OpenClaw...) **ke 40+ Provider AI & 100+ Model.**

**🌐 Bahasa:** [🇬🇧 English](README.md) (default) · [🇮🇩 Indonesia](README.id.md)

</div>

---

## 📖 Tentang

**OryphemRouter** adalah **gerbang routing AI** lokal yang menggabungkan seluruh kebutuhan AI coding Anda ke dalam **satu endpoint**. Dibangun oleh **tim oryphem** sebagai peningkatan dari 9Router, proyek ini menghadirkan:

- 🎯 **Auto-fallback** antar provider (Subscription → Cheap → Free) sehingga Anda **tidak pernah berhenti coding**
- 💸 **Hemat 20-40% token** dengan RTK Token Saver terintegrasi
- 🆓 **Gratis selamanya** dengan free tier Kiro, OpenCode Free, dan Vertex AI
- 🔒 **100% local-first** — data & API key Anda tidak pernah keluar dari mesin Anda
- 🌍 **Dua bahasa** — Indonesia & Inggris

---

## 🤔 Kenapa OryphemRouter?

**Berhenti buang uang, token, dan berhenti kena limit:**

- ❌ Kuota subscription habis tidak terpakai setiap bulan
- ❌ Rate limit menghentikan coding Anda di tengah jalan
- ❌ Output tools (git diff, grep, ls...) membakar token dengan cepat
- ❌ API mahal ($20-50/bulan per provider)
- ❌ Ganti-ganti provider secara manual

**OryphemRouter menyelesaikannya:**

- ✅ **RTK Token Saver** — Kompres tool_result otomatis, hemat **20-40% token**
- ✅ **Maksimalkan subscription** — Lacak kuota, gunakan setiap bit sebelum reset
- ✅ **Auto fallback** — Subscription → Cheap → Free, tanpa downtime
- ✅ **Multi-account** — Round-robin antar akun per provider
- ✅ **Universal** — Bekerja dengan Claude Code, Codex, Cursor, Cline, tool CLI apa pun
- ✅ **Cost-Optimized Routing** — Otomatis pilih provider termurah yang bekerja
- ✅ **Circuit Breaker** — Provider bermasalah otomatis di-cooldown 5 menit
- ✅ **Spending Limits** — Batasi biaya bulanan/harian untuk cegah tagihan tak terduga
- ✅ **Free-Tier Tracker** — Pantau sisa kuota gratis per provider

---

## 🔄 Cara Kerja

```
┌─────────────┐
│  Tool CLI   │  (Claude Code, Codex, OpenClaw, Cursor, Cline...)
│   Anda      │
└──────┬──────┘
       │ http://localhost:20129/v1
       ↓
┌─────────────────────────────────────────────┐
│        OryphemRouter (Smart Router)         │
│  • RTK Token Saver (potong tool_result)     │
│  • Format translation (OpenAI ↔ Claude)     │
│  • Quota tracking                           │
│  • Auto token refresh                       │
│  • Cost-Optimized routing                   │
│  • Circuit breaker + spending limits        │
└──────┬──────────────────────────────────────┘
       │
       ├─→ [Tier 1: SUBSCRIPTION] Claude Code, Codex, GitHub Copilot
       │   ↓ kuota habis
       ├─→ [Tier 2: CHEAP] GLM ($0.6/1M), MiniMax ($0.2/1M)
       │   ↓ budget limit
       └─→ [Tier 3: FREE] Kiro, OpenCode Free, Vertex ($300 credits)

Hasil: Tidak pernah berhenti coding, biaya minimal + hemat 20-40% token via RTK
```

---

## ⚡ Quick Start

### Instalasi

**Opsi 1 — npm (recommended untuk desktop):**

```bash
npm install -g oryphremrouter
oryphremrouter
```

🎉 Dashboard terbuka di `http://localhost:20129`

**Opsi 2 — Docker (server/VPS):**

> ⚠️ Image Docker siap-pakai belum dipublikasikan. Build dari source:

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

**Opsi 3 — Dari source (development):**

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
npm install
PORT=20129 NEXT_PUBLIC_BASE_URL=http://localhost:20129 npm run dev
```

### Langkah 1: Hubungkan provider gratis

Dashboard → Providers → Connect **Kiro AI** (Claude 4.5 + GLM-5 + MiniMax gratis) atau **OpenCode Free** (tanpa auth) → Selesai!

### Langkah 2: Gunakan di tool CLI Anda

```
Claude Code / Codex / OpenClaw / Cursor / Cline Settings:
  Endpoint: http://localhost:20129/v1
  API Key:  [copy dari dashboard]
  Model:    kr/claude-sonnet-4.5
```

### Langkah 3: Selesai! Mulai coding dengan AI model gratis.

---

## 💡 Fitur Utama

| Fitur | Apa yang Dilakukan | Kenapa Penting |
|-------|-------------------|----------------|
| 🚀 **RTK Token Saver** | Kompres output tools sebelum dikirim ke LLM | Hemat **20-40% token input** per request |
| 🧠 **Headroom Token Saver** | Proxy eksternal `/v1/compress` | Hemat lebih banyak context token |
| 🪨 **Caveman Mode** | Suntik prompt gaya caveman | Hemat **hingga 65% token output** |
| 🐴 **Ponytail** | Prompt "senior dev malas" | Lebih sedikit token, lebih sedikit kode |
| 🎯 **Smart 3-Tier Fallback** | Auto-route: Subscription → Cheap → Free | Tidak pernah berhenti coding |
| 📊 **Real-Time Quota Tracking** | Jumlah token live + hitung mundur reset | Maksimalkan nilai subscription |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex | Bekerja dengan tool CLI apa pun |
| 👥 **Multi-Account Support** | Banyak akun per provider | Load balancing + redundansi |
| 🔄 **Auto Token Refresh** | Token OAuth refresh otomatis | Tidak perlu login ulang manual |
| 🎨 **Custom Combos** | Kelompokkan model, pilih strategi per combo | Sesuaikan fallback dengan kebutuhan |
| 💰 **Spending Limits** | Batas biaya per hari/bulan + auto-pause | Cegah tagihan tak terduga |
| ⚡ **Cost-Optimized Routing** | Auto-pilih provider termurah yang bekerja | Minimalkan biaya otomatis |
| 🛡️ **Circuit Breaker** | 5 error → cooldown 5 menit, auto-recover | Ketahanan terhadap provider mati |
| 🆓 **Free-Tier Tracker** | Kuota gratis live per provider | Maksimalkan penggunaan gratis |
| 📝 **Request Logging** | Mode debug dengan log lengkap | Mudah troubleshoot |
| 💾 **Cloud Sync** | Sinkronkan config antar perangkat | Setup sama di mana saja |
| 🌐 **Deploy Anywhere** | Localhost, VPS, Docker, Cloudflare Workers | Deployment fleksibel |

---

## 🎯 Strategi Routing

OryphemRouter mendukung **4 strategi routing** per combo:

### 1. Fallback (default)
Coba model berurutan, pindah ke model berikutnya jika gagal.

```
Combo: "my-coding-stack"
  1. cc/claude-opus-4-7   (subscription)
  2. glm/glm-5.1          (backup murah)
  3. kr/claude-sonnet-4.5 (fallback gratis)
```

### 2. Round Robin
Putar model antar request untuk menyebarkan beban.

```
Request 1 → cc/claude-opus-4-7
Request 2 → glm/glm-5.1
Request 3 → kr/claude-sonnet-4.5
Request 4 → cc/claude-opus-4-7  (ulang)
```

### 3. Fusion
Query semua model paralel, lalu judge menyintesis satu jawaban. **Kualitas terbaik, biaya tertinggi** (N+1 calls).

### 4. Cost-Optimized (baru! ⭐)
Otomatis urutkan model dari **termurah** ke **termahal**, lalu fallback ke model berikutnya jika gagal.

```
Urutan biaya: oc (gratis) → kr (gratis) → vertex (gratis) → minimax ($0.2/1M) → glm ($0.6/1M) → cc (subscription)
```

**Cara pakai:** Dashboard → Combos → buat combo → pilih strategi di Profile Settings.

---

## 🆓 Free-Tier Budget Tracker

Halaman `/dashboard/free-tiers` menampilkan **penggunaan kuota gratis** secara real-time:

| Provider | Tipe | Kuota | Reset |
|----------|------|-------|-------|
| **Kiro AI** | Credits | 50 credits/bulan | Bulanan (1st) |
| **OpenCode Free** | Unlimited | ∞ | Tidak ada |
| **Vertex AI** | Credits | $300 | Sekali (90 hari) |
| **Felo** | Unlimited | ∞ | Tidak ada |

- 🟢 Progress bar *used / remaining* per provider
- 🔄 Auto-refresh setiap 60 detik
- 📊 Total free budget kumulatif

---

## 💰 Spending Limits

Cegah tagihan tak terduga dengan **spending limits**:

```js
// Settings → Profile → Spending Limits
spendingLimits: {
  maxCostPerMonth: "10",   // maks $10/bulan
  maxCostPerDay: "2",      // maks $2/hari
  autoPause: true,         // berhenti otomatis saat limit tercapai
  fallbackToFree: true     // fallback ke provider gratis jika limit tercapai
}
```

- 🔒 **autoPause: true** → request dibatasi saat limit tercapai
- 🔄 **fallbackToFree: true** → tetap jalan dengan provider gratis
- 🚫 **fallbackToFree: false** → blokir request dengan 403

---

## 🛡️ Circuit Breaker

Resilience otomatis terhadap provider yang bermasalah:

```
Error ke-1..4  → cooldown normal (backoff eksponensial)
Error ke-5     → 🔴 CIRCUIT OPEN (cooldown 5 menit)
Success        → 🟢 circuit reset (error count = 0)
```

- **Threshold:** 5 error beruntun
- **Cooldown:** 5 menit
- **Auto-recover:** setelah cooldown selesai

---

## 🔧 Integrasi CLI

### Cursor IDE

```
Settings → Models → Advanced:
  OpenAI API Base URL: http://localhost:20129/v1
  OpenAI API Key: [dari dashboard]
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
API Key: [dari dashboard]
Model: cc/claude-opus-4-7
```

---

## 📊 Model yang Tersedia

### Gratis

| Prefix | Provider | Model |
|--------|----------|-------|
| `kr/` | Kiro AI (50 credits/bulan) | `claude-sonnet-4.5`, `claude-haiku-4.5`, `glm-5`, `MiniMax-M2.5`, `qwen3-coder-next`, `deepseek-3.2` |
| `oc/` | OpenCode Free | Auto-fetch dari `opencode.ai/zen/v1/models` |
| `vertex/` | Vertex AI ($300 credits) | `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-flash` |

### Murah

| Prefix | Provider | Biaya | Model |
|--------|----------|-------|-------|
| `glm/` | GLM | $0.6/1M | `glm-5.1`, `glm-5`, `glm-4.7` |
| `minimax/` | MiniMax | $0.2/1M | `MiniMax-M2.7`, `MiniMax-M2.5` |
| `kimi/` | Kimi | $9/bulan flat | `kimi-k2.5`, `kimi-k2.5-thinking` |

### Subscription

| Prefix | Provider | Model |
|--------|----------|-------|
| `cc/` | Claude Code | `claude-opus-4-7`, `claude-opus-4-6`, `claude-sonnet-4-6` |
| `cx/` | Codex | `gpt-5.5`, `gpt-5.4`, `gpt-5.3-codex` |
| `gh/` | GitHub Copilot | `gpt-5.4`, `claude-opus-4.7`, `claude-sonnet-4.6` |
| `cu/` | Cursor | `claude-4.6-opus-max`, `claude-4.5-sonnet-thinking` |

---

## 🌐 Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `JWT_SECRET` | Auto-generated | Secret signing JWT untuk auth cookie |
| `INITIAL_PASSWORD` | `123` | Password login pertama |
| `DATA_DIR` | `~/.oryphemrouter` | Lokasi data utama (SQLite) |
| `PORT` | `20129` | Port service |
| `HOSTNAME` | framework default | Bind host (Docker: `0.0.0.0`) |
| `NODE_ENV` | runtime default | `production` untuk deploy |
| `BASE_URL` | `http://localhost:20129` | Base URL internal untuk cloud sync |
| `CLOUD_URL` | `https://oryphem.com` | Endpoint cloud sync |
| `API_KEY_SECRET` | `endpoint-proxy-api-key-secret` | Secret HMAC untuk API keys |
| `MACHINE_ID_SALT` | `endpoint-proxy-salt` | Salt untuk machine ID |
| `ENABLE_REQUEST_LOGS` | `false` | Aktifkan request logs |
| `AUTH_COOKIE_SECURE` | `false` | Force Secure cookie (HTTPS) |
| `REQUIRE_API_KEY` | `false` | Enforce Bearer API key pada `/v1/*` |

---

## 🚀 Deployment

### Docker

> ⚠️ Image Docker siap-pakai belum dipublikasikan. Build dari source:

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

→ Buka http://localhost:20129

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
- Kuota provider habis → Gunakan combo fallback atau pindah ke tier murah

**Rate limiting**
- Kuota subscription habis → Fallback ke GLM/MiniMax
- Tambah combo: `cc/claude-opus-4-7 → glm/glm-5.1 → kr/claude-sonnet-4.5`

**Token OAuth kedaluwarsa**
- Auto-refresh oleh OryphemRouter
- Jika masalah berlanjut: Dashboard → Provider → Reconnect

**Biaya tinggi**
- Aktifkan RTK di Dashboard → Endpoint settings (default ON, hemat 20-40% token)
- Set Spending Limits di Profile → Spending Limits
- Gunakan free tier (Kiro, OpenCode Free, Vertex) untuk tugas non-kritis

**Dashboard terbuka di port salah**
- Set `PORT=20129` dan `NEXT_PUBLIC_BASE_URL=http://localhost:20129`

**Login pertama tidak berfungsi**
- Cek `INITIAL_PASSWORD` di `.env`
- Password fallback adalah `123`

**Tidak ada request logs di `logs/`**
- Set `ENABLE_REQUEST_LOGS=true`

---

## 🛠️ Tech Stack

| Layer | Teknologi |
|-------|-----------|
| **Runtime** | Node.js 20+ |
| **Framework** | Next.js 16 |
| **UI** | React 19 + Tailwind CSS 4 |
| **Database** | SQLite (better-sqlite3 / node:sqlite / sql.js fallback) |
| **Streaming** | Server-Sent Events (SSE) |
| **Auth** | OAuth 2.0 (PKCE) + JWT + API Keys |
| **i18n** | Dua bahasa (Indonesia + English) |

---

## 🎁 Dukungan

Proyek ini dikembangkan dengan ❤️ oleh tim oryphem. Jika Anda merasa terbantu, pertimbangkan untuk mendukung kami:

### 🏦 Transfer Bank

| Bank | Atas Nama | Nomor Rekening |
|------|-----------|----------------|
| **Bank Mandiri** | **VIRGIAWAN PRIMA RIZK** | **1480022960655** |

Setiap dukungan membantu kami terus mengembangkan fitur baru dan pemeliharaan server. Terima kasih! 🙏

---

## 📧 Kontak

- **Website**: https://oryphem.com
- **GitHub**: https://github.com/virgiawanprima/OryphemRouter
- **Issues**: https://github.com/virgiawanprima/OryphemRouter/issues

---

## 👥 Kontributor

Terima kasih untuk semua kontributor yang membantu membuat OryphemRouter lebih baik!

[![Contributors](https://contrib.rocks/image?repo=virgiawanprima/OryphemRouter&max=150&columns=15&anon=1&v=20260309)](https://github.com/virgiawanprima/OryphemRouter/graphs/contributors)

---

## 📊 Star Chart

[![Star Chart](https://starchart.cc/virgiawanprima/OryphemRouter.svg?variant=adaptive)](https://starchart.cc/virgiawanprima/OryphemRouter)

---

## 🙏 Penghargaan

Dibangun di atas karya para raksasa:

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** — implementasi Go asli yang menginspirasi port JavaScript ini.
- **[RTK](https://github.com/rtk-ai/rtk)** ⭐ — token-saver Rust. OryphemRouter memporting pipeline kompresinya ke JS → **−20-40% token input** di setiap request.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** ⭐ oleh **[@JuliusBrussee](https://github.com/JuliusBrussee)** — viral _"why use many token when few token do trick"_. → **−65% token output**.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** ⭐ oleh **[@DietrichGebert](https://github.com/DietrichGebert)** — skill _"lazy senior dev"_ → **lebih sedikit token, lebih sedikit kode**.

Terima kasih besar untuk para penulis ini — tanpa karya mereka, fitur hemat token OryphemRouter tidak akan ada. ⭐ mereka di GitHub!

---

## 📄 Lisensi

Lisensi MIT — lihat [LICENSE](LICENSE) untuk detail.

---

<div align="center">
  <sub>Dibuat dengan ❤️ untuk developer yang coding 24/7 · 🇬🇧 English · 🇮🇩 Indonesia</sub>
</div>