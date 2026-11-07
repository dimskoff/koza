<div align="center">

# koza

**Modern, privacy-first URL shortener and peer-to-peer file transfer engine.**  
*Anonymous, end-to-end encrypted, zero logs, zero database bloat.*

[![License: GPL-3.0](https://img.shields.io/badge/License-GPL--3.0-blue.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-15%2B-black?logo=next.js)](https://nextjs.org/)
[![WebRTC](https://img.shields.io/badge/WebRTC-E2E%20Encrypted-blue?logo=webrtc)](https://webrtc.org/)
[![Docker Ready](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://docker.com)
[![Dokploy Ready](https://img.shields.io/badge/Dokploy-Supported-8B5CF6)](https://dokploy.com)

[**Live Demo (koza.click)**](https://koza.click) • [**File Transfer (box.koza.click)**](https://box.koza.click) • [**Status & Telemetry**](https://koza.click/status) • [**API Docs**](https://koza.click/docs) • [**Self-Host Guide**](#self-hosting)

</div>

---

## ✨ Features

### 🔗 URL Shortener (`koza.click`)
- **Zero Strings Attached**: No user accounts, tracking cookies, or ads.
- **Custom Slugs**: Create memorable handles (e.g. `koza.click/gh`).
- **Passcode Protection**: Gate links behind salted scrypt password verification.
- **Click Analytics**: Real-time click counting without harvesting user fingerprints.
- **Instant QR Codes**: Auto-generated SVG QR codes for offline sharing.

### 📦 Direct P2P Box (`box.koza.click`)
- **Direct Browser-to-Browser**: Files travel directly between peers via `RTCDataChannel`.
- **Zero Server Storage**: Your files **never touch the server disk** or cloud storage.
- **End-to-End Encryption**: DTLS/SRTP encryption is enforced at the WebRTC protocol layer.
- **No File Size Caps**: Send 10 MB, 10 GB, or 100 GB directly peer-to-peer with chunked backpressure.
- **Secure Line Tokens**: Auto-generated 6-letter room codes with optional room passwords.
- **TURN Relay Fallback**: Integrated Coturn relay for strict symmetric NAT networks.

### ⚡ Instance Telemetry & Admin
- **Lightweight Status Dashboard**: View active links, live P2P lines, memory RSS, and uptime at `/status`.
- **Admin Key Authorization**: Protect deletion and full link inspection using `KOZA_ADMIN_KEY`.
- **Atomic JSON Storage**: Persistent state stored in a single atomic JSON file — zero heavy database dependencies required.

---

## 🏗️ Architecture

```
                                  ┌───────────────────────────┐
                                  │      Client Browser       │
                                  └─────────────┬─────────────┘
                                                │
                     ┌──────────────────────────┴──────────────────────────┐
                     │ HTTPS / WebSockets                                  │
                     ▼                                                     ▼
           ┌──────────────────┐                                  ┌──────────────────┐
           │ Next.js Frontend │                                  │  Signaling & API │
           │   (Port 3000)    │ ────── Proxy (/api/v1) ───────►  │   (Port 8787)    │
           └──────────────────┘                                  └─────────┬────────┘
                                                                           │
                                      ┌────────────────────────────────────┴───┐
                                      │                                        │
                                      ▼                                        ▼
                             ┌────────────────┐                       ┌────────────────┐
                             │ JSON Storage   │                       │ WebRTC Coturn  │
                             │ (/data volume) │                       │ (Port 3478)    │
                             └────────────────┘                       └────────────────┘
```

---

## 🚀 Quickstart (Self-Hosting)

Deploy your own complete Koza instance in 60 seconds with Docker Compose:

### 1. Clone the repository
```bash
git clone https://github.com/dimskoff/koza.git
cd koza
```

### 2. Configure Environment
```bash
cp .env.example .env
```
Edit `.env` to set your desired `KOZA_ADMIN_KEY` and domains:
```ini
KOZA_ADMIN_KEY=your_secret_admin_key_here
KOZA_BASE_URL=https://koza.example.com
KOZA_HOST=koza.example.com
KOZA_BOX_HOST=box.koza.example.com
```

### 3. Start with Docker Compose
```bash
docker compose up -d --build
```

Your service is now running:
- **Web UI**: `http://localhost:3000`
- **Backend API & WebSockets**: `http://localhost:8787`
- **Status Dashboard**: `http://localhost:3000/status`

---

## 🚢 Production Deployment

### Option A: Dokploy (Recommended for VPS)
Koza is fully pre-configured for **Dokploy** with Traefik auto-SSL:

1. Open your Dokploy panel (`https://your-dokploy-domain.com`).
2. Create a new Project (or select existing) → **Add Service** → **Compose**.
3. Set Source to **GitHub**:
   - Repository: `dimskoff/koza` (or your fork)
   - Branch: `main`
   - Compose Path: `infra/dokploy-compose.yml`
4. In Environment Variables, configure:
   ```env
   KOZA_ADMIN_KEY=generate_with_openssl_rand_hex_24
   KOZA_BASE_URL=https://koza.yourdomain.com
   KOZA_HOST=koza.yourdomain.com
   KOZA_BOX_HOST=box.koza.yourdomain.com
   KOZA_TURN_SECRET=optional_turn_secret
   ```
5. Click **Deploy**. Dokploy automatically manages builds, connects Traefik, provisions Let's Encrypt certificates, and sets up WebSocket routing.

### Option B: Docker Compose with Automatic Caddy HTTPS
```bash
docker compose --profile proxy up -d --build
```
Point DNS A records for `koza.yourdomain.com` and `box.yourdomain.com` to your server. Caddy provisions Let's Encrypt certificates automatically.

---

## 🛠️ Environment Variables Reference

| Variable | Default | Description |
| :--- | :--- | :--- |
| `KOZA_ADMIN_KEY` | *(empty = open)* | Secret key for DELETE operations and admin dashboard view. |
| `KOZA_BASE_URL` | `http://localhost:3000` | Canonical public origin for generated short URLs. |
| `KOZA_HOST` | `koza.click` | Main domain for short links. |
| `KOZA_BOX_HOST` | `box.koza.click` | Subdomain routing directly to Box P2P mode. |
| `KOZA_DATA_DIR` | `/data` | Path inside container for persistent JSON storage. |
| `KOZA_ROOM_TTL_MS` | `3600000` (1 hr) | Inactivity expiration time for P2P transfer lines. |
| `KOZA_TURN_SECRET` | *(empty)* | Coturn `use-auth-secret` HMAC secret for NAT traversal. |
| `KOZA_TURN_URLS` | *(empty)* | Comma-separated list of TURN endpoints. |

---

## 💻 Terminal CLI (`cli/koza.sh`)

A standalone bash script to manage short links and P2P lines from the terminal:

```bash
chmod +x cli/koza.sh

# Shorten a link
./cli/koza.sh shorten https://news.ycombinator.com hn

# Shorten with password protection
./cli/koza.sh shorten https://secret.doc mydoc "supersecret"

# List all links
./cli/koza.sh list

# Inspect system status
./cli/koza.sh stats

# Open a P2P transfer room
./cli/koza.sh room
```

---

## 📡 REST & WebSocket API

Interactive human documentation is live at `/docs`.

```bash
# Mint a short link
curl -X POST https://koza.click/api/v1/shorten \
  -H "Content-Type: application/json" \
  -d '{"url": "https://github.com", "slug": "gh"}'

# Open a direct P2P transfer line
curl -X POST https://koza.click/api/v1/box/rooms \
  -H "Content-Type: application/json" \
  -d '{"files": [{"name": "archive.zip", "size": 10485760}]}'

# Connect WebRTC Signaling
# wss://koza.click/signal
```

---

## 📄 License

Distributed under the [MIT License](./LICENSE).  
Maintained by [dimskoff](https://github.com/dimskoff).
