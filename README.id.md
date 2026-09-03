<div align="center">

# 🚀 OryphemRouter

**AI Router & Token Saver: Jangan pernah berhenti coding. Hemat token, uang, dan rate limit.**

[![npm](https://img.shields.io/badge/npm-coming%20soon-orange?logo=npm)](https://www.npmjs.com/package/oryphemrouter)
[![Node](https://img.shields.io/badge/node-20%2B-brightgreen)](https://nodejs.org)
[![Docker](https://img.shields.io/badge/ghcr.io-available-blue?logo=docker)](https://github.com/virgiawanprima/OryphemRouter/pkgs/container/oryphemrouter)
[![Stars](https://img.shields.io/github/stars/virgiawanprima/OryphemRouter?style=flat&color=yellow)](https://github.com/virgiawanprima/OryphemRouter)
[![Forks](https://img.shields.io/github/forks/virgiawanprima/OryphemRouter?style=flat&color=blue)](https://github.com/virgiawanprima/OryphemRouter)
[![Last Commit](https://img.shields.io/github/last-commit/virgiawanprima/OryphemRouter)](https://github.com/virgiawanprima/OryphemRouter)
[![License](https://img.shields.io/github/license/virgiawanprima/OryphemRouter)](https://github.com/virgiawanprima/OryphemRouter/blob/main/LICENSE)

**Hubungkan Semua Tools AI Coding** (Claude Code, Cursor, Antigravity, Copilot, Codex, OpenCode, Cline, OpenClaw...) **ke 380+ Provider AI & 1600+ Model.**

![Dashboard](public/images/overview.png)

</div>

---

## 🌐 Bahasa / Bahasa

- 🇬🇧 **English**: [README.md](./README.md)
- 🇮🇩 **Indonesia** (default): [README.id.md](./README.id.md)

---

## 📑 Daftar Isi

- [📖 Tentang](#-tentang)
- [🤔 Kenapa OryphemRouter?](#-kenapa-oryphemrouter)
- [🔄 Cara Kerja](#-cara-kerja)
- [⚡ Quick Start](#-quick-start)
- [💡 Fitur Utama](#-fitur-utama)
- [🧭 Modul Dashboard](#-modul-dashboard)
- [🎯 Strategi Routing](#-strategi-routing)
- [🆓 Free-Tier Budget Tracker](#-free-tier-budget-tracker)
- [💰 Spending Limits](#-spending-limits)
- [🛡️ Circuit Breaker](#️-circuit-breaker)
- [🔧 Integrasi CLI](#-integrasi-cli)
- [📊 Model yang Tersedia](#-model-yang-tersedia)
- [🌐 Environment Variables](#-environment-variables)
- [🚀 Deployment](#-deployment)
- [📝 API Reference](#-api-reference)
- [🐛 Troubleshooting](#-troubleshooting)
- [🛠️ Tech Stack](#️-tech-stack)
- [🤝 Kontribusi](#-kontribusi)
- [🙏 Penghargaan](#-penghargaan)
- [🎁 Dukungan](#-dukungan)
- [📧 Kontak](#-kontak)
- [📄 Lisensi](#-lisensi)

---

## 📖 Tentang

**OryphemRouter** adalah **gerbang routing AI** lokal yang menggabungkan seluruh kebutuhan AI coding Anda ke dalam **satu endpoint**. Proyek ini menghadirkan:

- 🎯 **Auto-fallback** antar provider (Subscription → Cheap → Free) sehingga Anda **tidak pernah berhenti coding**
- 💸 **Hemat 20-40% token** dengan RTK Token Saver terintegrasi
- 🆓 **Gratis selamanya** dengan katalog free tier bawaan (Kiro, OpenCode Free, dan lainnya)
- 🔒 **100% local-first**: data & API key Anda tidak pernah keluar dari mesin Anda
- 🌍 **Dua bahasa**: Indonesia & English

---

## 🤔 Kenapa OryphemRouter?

**Berhenti buang uang, token, dan berhenti kena limit:**

- ❌ Kuota subscription habis tidak terpakai setiap bulan
- ❌ Rate limit menghentikan coding Anda di tengah jalan
- ❌ Output tools (git diff, grep, ls...) membakar token dengan cepat
- ❌ API mahal ($20-50/bulan per provider)
- ❌ Ganti-ganti provider secara manual

**OryphemRouter menyelesaikannya:**

- ✅ **RTK Token Saver**: Kompres tool_result otomatis, hemat **20-40% token**
- ✅ **Maksimalkan subscription**: Lacak kuota, gunakan setiap bit sebelum reset
- ✅ **Auto fallback**: Subscription → Cheap → Free, tanpa downtime
- ✅ **Multi-account**: Round-robin antar akun per provider
- ✅ **Universal**: Bekerja dengan Claude Code, Codex, Cursor, Cline, tool CLI apa pun
- ✅ **Auto combo ranking**: AI menilai & memilih model terbaik
- ✅ **Circuit Breaker**: Provider bermasalah otomatis di-cooldown 5 menit
- ✅ **Spending Limits**: Batasi biaya bulanan/harian untuk cegah tagihan tak terduga
- ✅ **Free-Tier Tracker**: Pantau sisa kuota gratis per provider

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
│  • Auto combo ranking (AI-scored)            │
│  • Circuit breaker + spending limits        │
└──────┬──────────────────────────────────────┘
       │
       ├─→ [Tier 1: SUBSCRIPTION] Claude Code, Codex, GitHub Copilot
       │   ↓ kuota habis
       ├─→ [Tier 2: CHEAP] GLM, MiniMax, Kimi
       │   ↓ budget limit
       └─→ [Tier 3: FREE] Kiro, OpenCode Free, Pollinations

Hasil: Tidak pernah berhenti coding, biaya minimal + hemat 20-40% token via RTK
```

---

## ⚡ Quick Start

### 📋 Persyaratan

| OS | Persyaratan |
|----|-------------|
| 🪟 **Windows** | Windows 10/11, Node.js 20+ |
| 🍎 **macOS** | macOS 12+, Node.js 20+ |
| 🐧 **Linux** | Ubuntu/Debian/Fedora/Arch, Node.js 20+ |
| 🐳 **Docker** | Docker 20.10+ (semua OS) |

> **Node.js 20+** diperlukan. Unduh dari [nodejs.org](https://nodejs.org) atau pakai package manager OS Anda.

### 🪟 Windows / 🍎 macOS / 🐧 Linux

Clone dan jalankan dari source:

```bash
git clone https://github.com/virgiawanprima/OryphemRouter.git
cd OryphemRouter
npm install

# Development (hot reload)
npm run dev

# Production
npm run build
npm run start
```

> **Node.js 20+** diperlukan. Unduh dari [nodejs.org](https://nodejs.org).
>
> Ingin launcher mandiri? CLI bawaan ada di [`cli/`](./cli/) dan menyediakan bin `oryphemrouter` (start/stop server, tray UI di desktop).

### 🐳 Docker (semua OS)

```bash
docker run -d --name oryphemrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/virgiawanprima/oryphemrouter:latest
```

### ✅ Verifikasi instalasi

```bash
curl http://localhost:20129/api/health
# → respons sehat
```

🎉 Dashboard terbuka di `http://localhost:20129`

---

## 💡 Fitur Utama

| Fitur | Apa yang Dilakukan | Kenapa Penting |
|-------|-------------------|----------------|
| 🚀 **RTK Token Saver** | Kompres output tools sebelum dikirim ke LLM | Hemat **20-40% token input** per request |
| 🧠 **Headroom Token Saver** | Proxy eksternal `/v1/compress` | Hemat lebih banyak context token |
| 🪨 **Caveman Mode** | Suntik prompt gaya caveman | Hemat **hingga 65% token output** |
| 🐴 **Ponytail** | Prompt "senior dev malas" | Lebih sedikit token & kode |
| 🎯 **Smart 3-Tier Fallback** | Auto-route: Subscription → Cheap → Free | Tidak pernah berhenti coding |
| 📊 **Real-Time Quota Tracking** | Jumlah token live + hitung mundur reset | Maksimalkan nilai subscription |
| 🔄 **Format Translation** | OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex | Bekerja dengan tool CLI apa pun |
| 👥 **Multi-Account Support** | Banyak akun per provider | Load balancing + redundansi |
| 💰 **Spending Limits** | Batas biaya per hari/bulan + auto-pause | Cegah tagihan tak terduga |
| ⚡ **Auto Combo Ranking** | Peringkat model berbasis skor AI untuk strategi `auto` | Pilih model terbaik otomatis |
| 🛡️ **Circuit Breaker** | 5 error → cooldown 5 menit, auto-recover | Ketahanan terhadap provider mati |
| 🆓 **Free-Tier Tracker** | Kuota gratis live per provider | Maksimalkan penggunaan gratis |
| 🎨 **Custom Combos** | Kelompokkan model, pilih strategi per combo | Sesuaikan fallback dengan kebutuhan |
| 🖼️ **Media Providers** | TTS/STT, gambar, video, musik, OCR, rerank, moderasi | Satu gateway untuk semua jenis media |
| 🧩 **Proxy Pools** | Rotasi proxy keluar & strategi per provider | Bypass batasan geo/rate |
| 🔀 **Translator** | Konversi format request/response secara live | Ganti provider tanpa hambatan |
| 💡 **Skills & MCP** | Agent skills-pack + MCP plugin server | Perluas agent sekali klik |
| 🌐 **Deploy Anywhere** | Localhost, VPS, Docker, Cloudflare/Firebase | Deployment fleksibel |

---


## 🧭 Modul Dashboard

Dashboard OryphemRouter terorganisir dalam modul fokus. Berikut penjelasan tiap modul.

### 📡 Providers (Penyedia)

Kelola semua koneksi provider AI dari satu tempat.

- **Hubungkan provider**: Claude Code, Codex, GitHub Copilot, Cursor, Kiro, OpenCode, GLM, MiniMax, Kimi, dan 380+ lainnya.
- **Login OAuth**: Login sekali-klik untuk provider subscription (Claude Code, Codex, GitHub, Cursor, Kiro).
- **API key**: Tambah, edit, jeda, atau hapus API key per provider. Mendukung **bulk add** dengan penamaan otomatis:
  ```
  nama1|sk-key1
  nama2|sk-key2
  sk-key-otomatis-bernama
  ```
- **Multi-account**: Tambah beberapa akun per provider. OryphemRouter memutar antar akun dan fallback ke akun berikutnya jika gagal.
- **Test koneksi**: Validasi API key sebelum disimpan dengan penguji koneksi bawaan.
- **Data spesifik provider**: Set base URL, region, atau deployment untuk Azure, Cloudflare AI, Ollama-local, dan endpoint kompatibel.

### 🔌 Endpoint

Pintu depan gateway: satu URL kompatibel-OpenAI untuk semua tools Anda.

- **Endpoint lokal**: `http://localhost:20129/v1` (tools CLI Anda menunjuk ke sini).
- **API keys**: Buat dan kelola key untuk autentikasi request ke `/v1/*`.
- **Toggle Require API key**: Terapkan autentikasi `Bearer` pada setiap request.
- **Cloudflare Tunnel**: Ekspos gateway lokal Anda ke internet sekali-klik (tanpa port forwarding).
- **Tailscale Funnel**: Akses remote alternatif melalui jaringan Tailscale Anda.
- **Status realtime**: Dashboard streaming kesehatan tunnel/Tailscale secara live via SSE, tanpa refresh.

### 🎨 Combos

Kelompokkan model di bawah satu nama dan pilih strategi routing.

- **Buat combo**: beri nama, tambah model sesuai prioritas (drag untuk urutkan ulang).
- **Template**: sekali-klik **Free Combo** (model gratis di depan) atau preset **Premium Combo**.
- **Strategi per-combo**: Fallback, Round Robin, Fusion, Pipeline, atau Auto (lihat Strategi Routing).
- **Capacity adapter**: pool fallback otomatis untuk vision/audio saat model target kurang kapabilitas.
- **Pakai di mana saja**: gunakan nama combo sebagai `model` di tool CLI mana pun.

### 📊 Usage & Analytics (Penggunaan & Analitik)

Lacak setiap request yang mengalir melalui gateway.

- **Log request**: request terbaru dengan provider, model, token, biaya, dan status.
- **Grafik**: penggunaan token dan biaya dari waktu ke waktu (hari ini, 24 jam, 7 hari, 30 hari).
- **Rincian per-provider**: provider/model mana yang mengonsumsi apa.
- **Detail request**: drill ke satu request untuk memeriksa header, payload, dan timing.
- **Real-time**: tampilan usage terupdate live via SSE saat request selesai.

### 📈 Quota Tracker (Pelacak Kuota)

Pantau kuota provider agar Anda tidak berhenti di tengah sesi.

- **Kuota per-provider**: sisa token/kredit dan hitung mundur reset.
- **Auto-ping**: pemeriksaan kuota terjadwal opsional untuk akun Claude Code dan Codex.
- **Timer reset**: hitung mundur reset 5 jam, harian, mingguan, atau bulanan.
- **Peringatan**: lihat sekilas saat provider mendekati batas agar fallback berjalan mulus.

### 🖼️ Media Providers (Penyedia Media)

Satu gateway untuk setiap jenis media AI — bukan hanya chat.

- **Jenis**: Text-to-Speech, Speech-to-Text, Text-to-Image, Video, Musik, Embeddings, Web Search, Web Fetch, Image Upscale, OCR, Rerank, Moderasi.
- **Rute per-jenis**: setiap jenis memetakan ke endpoint-nya sendiri (mis. `/v1/audio/speech`, `/v1/images/generations`, `/v1/videos/generations`).
- **Combo untuk media**: kelompokkan beberapa provider dalam satu combo media, dengan strategi round-robin/fallback sendiri.
- **Katalog suara & model**: daftar suara/model live per provider (mis. ElevenLabs, Deepgram, MiniMax voices).

### 🧩 Proxy Pools

Rutekan traffic upstream melalui proxy keluar.

- **Manajemen pool**: tambah, uji, dan nonaktifkan proxy SOCKS5/HTTP.
- **Strategi per-provider**: atur strategi rotasi (`round-robin`, `none`, ...) ke sebuah pool.
- **Keamanan**: jaga IP rumah tetap privat saat memanggil provider.

### 🔀 Translator

Konversi format request/response secara live antar provider.

- **Konversi pesan**: OpenAI ↔ Claude ↔ Gemini ↔ Cursor ↔ Kiro ↔ Vertex.
- **Simpan/muat preset**: profil terjemahan yang dapat dipakai ulang.
- **Console logs**: inspeksi output terjemahan secara live via SSE.

### 💡 Skills & MCP

Perluas agent coding Anda dengan skills dan server MCP.

- **Skills pack**: pasang skills agent yang dirutekan melalui OryphemRouter.
- **MCP server**: paparkan tools melalui Model Context Protocol (`/api/mcp/*`).

### 💾 Token Saver (Penghemat Token)

Potong penggunaan token otomatis sebelum request sampai ke LLM.

- **RTK Token Saver**: kompres output `tool_result` (git diff, grep, ls, log) tanpa kehilangan, hemat 20-40% token input. Matikan per request dengan `x-oryphemrouter-token-saver: off`.
- **Headroom**: proxy eksternal `/v1/compress` opsional untuk penghematan konteks lebih.
- **Caveman Mode**: output terse gaya caveman, hemat hingga 65% token output.
- **Ponytail**: prompt "senior dev malas" yang menulis kode minimal berprinsip YAGNI.
- **PXPIPE**: kompresi request transparan untuk tools yang didukung.

### 🛠️ CLI Tools

Konfigurasi sekali-klik untuk coding agent Anda.

- **Auto-detect**: OryphemRouter mendeteksi tools CLI yang terinstal (Claude Code, Codex, OpenClaw, Cursor, Cline, dll).
- **Terapkan config**: arahkan tool apa pun ke endpoint lokal dengan beberapa klik.
- **Pengaturan per-tool**: pemilihan API key, preset endpoint, pemilih model, dan edit file config.
- **Verifikasi status**: lihat apakah tiap tool sudah terhubung dan di mana config-nya.

---

## 🎯 Strategi Routing

OryphemRouter mendukung **4 strategi routing** per combo:

| Strategi | Cara Kerja | Biaya |
|----------|------------|-------|
| **1. Fallback** (default) | Coba model berurutan, pindah ke berikutnya jika gagal | Murah |
| **2. Round Robin** | Putar model antar request untuk menyebarkan beban | Murah |
| **3. Fusion** | Query semua model paralel, judge menyintesis jawaban | Mahal (N+1) |
| **4. Pipeline** | Rantai model bertahap, tiap tahap memberi ke tahap berikut | Variabel |
| **5. Auto** ⭐ | Peringkat berbasis skor AI — otomatis pilih model terbaik per request | Minimal |

**Cara pakai:** Dashboard → Combos → buat combo → pilih strategi di Profile Settings.

---

## 🆓 Free-Tier Budget Tracker

Halaman `/dashboard/free-tiers` menampilkan **penggunaan kuota gratis** secara real-time. Provider free-tier ditemukan otomatis dan difilter ke yang benar-benar merespons `2xx`, sehingga daftar mencerminkan yang benar-benar berfungsi tanpa API key. Contohnya:

| Provider | Tipe | Catatan |
|----------|------|---------|
| Kiro | Agent/IDE (MITM) | Free tier berbasis subscription |
| OpenCode | Katalog | Model gratis `opencode.ai/zen` |
| Pollinations | Gratis | Tanpa API key |
| Felo | Gratis | Berbasis search |
| Ollama / Local | Lokal | `ollama` & `ollama-local` |

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

- 🔒 **autoPause: true**: request dibatasi saat limit tercapai
- 🔄 **fallbackToFree: true**: tetap jalan dengan provider gratis
- 🚫 **fallbackToFree: false**: blokir request dengan 403

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

OryphemRouter mendeteksi dan mengonfigurasi agent coding yang terinstal dari dashboard (Dashboard → CLI Tools). Tool yang didukung antara lain:

Claude Code, Codex CLI/App, OpenCode, Cursor, Cline, Continue, Roo, Kilo Code, Amp CLI, Qwen Code, jcode, DeepSeek TUI, Devin CLI, Grok Build, Hermes, Factory Droid, Claude Cowork, OpenClaw, OpenDesign, plus agent yang di-intercept MITM **Antigravity**, **Kiro** dan **GitHub Copilot**.

### Cursor IDE

```
Settings → Models → Advanced:
  OpenAI API Base URL: http://localhost:20129/v1
  OpenAI API Key: [dari dashboard]
  Model: cc/claude-opus-5
```

### Claude Code

Edit `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://localhost:20129",
    "ANTHROPIC_MODEL": "cc/claude-sonnet-5"
  }
}
```

### Codex CLI

```bash
export OPENAI_BASE_URL="http://localhost:20129"
export OPENAI_API_KEY="your-oryphemrouter-api-key"
codex "your prompt"
```

### Cline / Continue / RooCode / Kilo

```
Provider: OpenAI Compatible
Base URL: http://localhost:20129/v1
API Key: [dari dashboard]
Model: cc/claude-opus-5
```

> Untuk panduan lengkap per-tool (Amp, Qwen, jcode, DeepSeek TUI, Grok Build, OpenDesign...), buka dashboard → CLI Tools → tool Anda.

---

## 📊 Model yang Tersedia

> OryphemRouter membawa **380+ entri registry provider** dan **1600+ definisi model**. Di bawah ini adalah prefix yang paling umum; katalog lengkap dapat dijelajahi di dashboard (Providers → Models).

### 🆓 Gratis / Free-Tier (auto-routed)

| Prefix | Provider | Catatan |
|--------|----------|---------|
| `kr/` | Kiro | Kiro Agent/IDE (MITM) |
| `oc/` | OpenCode | katalog gratis `opencode.ai/zen` |
| `vertex/` | Vertex AI | Google Vertex free tier |
| `pollinations/` | Pollinations | Gratis, tanpa key |
| `felo/` | Felo | Gratis berbasis search |

### 💰 Murah

| Prefix | Provider | Biaya |
|--------|----------|-------|
| `glm/` | GLM | murah/1M |
| `minimax/` | MiniMax | murah/1M |
| `kimi/` | Kimi | flat |

### 💳 Subscription (OAuth / MITM)

| Prefix | Provider | Model |
|--------|----------|-------|
| `cc/` | Claude Code | `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5` |
| `cw/` | Claude Web | `claude-opus-4-8`, `claude-sonnet-4-6` |
| `cx/` | Codex | `gpt-5.6-sol`, `gpt-5.5`, `gpt-5.4` |
| `cu/` | Cursor | `claude-4.6-opus-max`, `gpt-5.2-codex`, `kimi-k2.5` |
| `gh/` | GitHub Copilot | `gpt-5-mini`, `claude-haiku-4.5` |
| `ag/` | Antigravity | `gemini-3.6-flash-high`, `gemini-3.1-pro` |

---

## 🌐 Environment Variables

| Variable | Default | Deskripsi |
|----------|---------|-----------|
| `JWT_SECRET` | Auto-generated | Secret signing JWT untuk auth cookie (buat dengan `openssl rand -hex 32`) |
| `INITIAL_PASSWORD` | `123` | Password login pertama |
| `DATA_DIR` | `~/.oryphemrouter` | Lokasi data utama (SQLite) |
| `PORT` | `20129` | Port service |
| `NODE_ENV` | runtime default | `production` untuk deploy |
| `HOSTNAME` | framework default | Bind host (Docker: `0.0.0.0`) |
| `BASE_URL` | `http://localhost:20129` | Base URL internal agar job sync bisa menjangkau instance ini |
| `CLOUD_URL` | `https://oryphem.com` | Endpoint cloud sync |
| `NEXT_PUBLIC_BASE_URL` | `http://localhost:20129` | Base URL publik |
| `NEXT_PUBLIC_CLOUD_URL` | `https://oryphem.com` | Cloud URL publik |
| `API_KEY_SECRET` | default endpoint-proxy | Secret HMAC untuk API keys (buat dengan `openssl rand -hex 32`) |
| `MACHINE_ID_SALT` | default endpoint-proxy | Salt untuk machine ID (buat dengan `openssl rand -hex 32`) |
| `ENABLE_REQUEST_LOGS` | `false` | Aktifkan request logs |
| `REQUIRE_API_KEY` | `false` | Enforce Bearer API key pada `/v1/*` |
| `OBSERVABILITY_ENABLED` | `true` | Aktifkan observabilitas |
| `AUTH_COOKIE_SECURE` | `false` | Tandai cookie auth `Secure` (set `true` di balik HTTPS) |
| `HTTP_PROXY` / `HTTPS_PROXY` | unset | Proxy keluar untuk panggilan provider (varian huruf kecil juga didukung) |
| `SEARXNG_URL` | unset | Endpoint SearXNG untuk provider web-search bawaan |
| `GOOGLE_OAUTH_CLIENT_ID` / `_SECRET` | unset | OAuth client Google (login Gemini / Antigravity) |
| `ANTIGRAVITY_OAUTH_CLIENT_ID` / `_SECRET` | unset | Kredensial OAuth client Antigravity |

> 📄 Lihat [`.env.example`](./.env.example) untuk referensi lengkap.

---

## 🚀 Deployment

### 🐳 Docker

Image sudah dipublikasikan di **GHCR** (multi-platform):

```bash
docker pull ghcr.io/virgiawanprima/oryphemrouter:latest

docker run -d \
  --name oryphemrouter \
  -p 20129:20129 \
  -v "$HOME/.oryphemrouter:/app/data" \
  -e DATA_DIR=/app/data \
  ghcr.io/virgiawanprima/oryphemrouter:latest
```

→ Buka http://localhost:20129

### ☁️ VPS

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
pm2 start npm --name oryphemrouter -- start
pm2 save
pm2 startup
```

### 🐳 docker-compose

```yaml
services:
  oryphemrouter:
    image: ghcr.io/virgiawanprima/oryphemrouter:latest
    ports:
      - "20129:20129"
    volumes:
      - oryphemrouter-data:/app/data
    environment:
      DATA_DIR: /app/data
      PORT: "20129"
volumes:
  oryphemrouter-data:
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

## 🤝 Kontribusi

Kontribusi sangat diterima! Berikut caranya:

1. 🍴 **Fork** repository di [GitHub](https://github.com/virgiawanprima/OryphemRouter)
2. 🌿 **Buat branch**: `git checkout -b feat/fitur-anda`
3. ✍️ **Buat perubahan** (lihat [Panduan Kontribusi](./CONTRIBUTING.md))
4. ✅ **Test** (unit): `npx vitest --config tests/vitest.config.js tests/unit/`
5. ✅ **Test** (E2E): `npx playwright test tests/e2e/` (jalankan server dulu: `npm run dev` di port 20129)
6. 📦 **Build**: `npm run build`
7. 🔀 **Kirim Pull Request**

**Commit atomic & conventional** wajib: `feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`.

---

## 🙏 Penghargaan

Dibangun di atas karya para raksasa:

- **[CLIProxyAPI](https://github.com/router-for-me/CLIProxyAPI)** ⭐ implementasi Go asli yang menginspirasi port JavaScript ini.
- **[RTK](https://github.com/rtk-ai/rtk)** ⭐ token-saver Rust → **−20-40% token input** di setiap request.
- **[Caveman](https://github.com/JuliusBrussee/caveman)** ⭐ oleh **[@JuliusBrussee](https://github.com/JuliusBrussee)** → **−65% token output**.
- **[Ponytail](https://github.com/DietrichGebert/ponytail)** ⭐ oleh **[@DietrichGebert](https://github.com/DietrichGebert)** → lebih sedikit token & kode.

Terima kasih besar untuk para penulis ini! ⭐ mereka di GitHub!

---

## 🎁 Dukungan

Proyek ini dikembangkan dengan ❤️ oleh tim oryphem. Jika Anda merasa terbantu, pertimbangkan untuk mendukung kami:

### 🏦 Transfer Bank

| Bank | Atas Nama | Nomor Rekening |
|------|-----------|----------------|
| **Bank Mandiri** | **VIRGIAWAN PRIMA RIZK** | **1480022960655** |

Setiap dukungan membantu kami terus mengembangkan fitur baru dan pemeliharaan server. Terima kasih! 🙏

---

## 🔒 Error Handling & Aksesibilitas

### `parseJson`

Semua API route dan SSE handler kini memakai `parseJson(request)` dari
`src/lib/utils/parseJson.js` ketika membaca body JSON. Utility ini membungkus
`request.json()` dan melempar `Error("Invalid JSON payload")` yang normalisasi
sehingga handler bisa menangkapnya dan mengembalikan `400 Bad Request` alih‑alih
`500 Internal Server Error` akibat `SyntaxError` yang tidak tertangani.

### Aksesibilitas UI

Komponen yang dapat diklik (`<div onClick>`) telah diperbaiki menjadi elemen
yang dapat diakses keyboard: ditambahkan `role="button"`, `tabIndex`, `aria‑label`,
`aria‑expanded`, dan handler `onKeyDown` (Enter/Space). Overlay modal juga
mendapat `role="dialog"` + `aria‑modal`. Ini berlaku untuk kartu CLI‑tool, area
"Copy" di landing, dan modal MCP kustom.

---

## 📧 Kontak

- 🌐 **Website**: https://oryphem.com
- 🐙 **GitHub**: https://github.com/virgiawanprima/OryphemRouter
- 🐛 **Issues**: https://github.com/virgiawanprima/OryphemRouter/issues

---

## 📄 Lisensi

Lisensi MIT — lihat [LICENSE](./LICENSE) untuk detail.

---

<div align="center">
  <sub>Dibuat dengan ❤️ untuk developer yang coding 24/7</sub>
</div>