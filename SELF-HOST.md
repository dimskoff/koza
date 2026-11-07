# Self-Hosting Guide for koza

Deploy your own complete privacy-first URL shortener and P2P file transfer node.

---

## Architecture Overview

Koza consists of three core components:
1. **Frontend (`web`)**: Next.js 15+ standalone application with dark terminal aesthetic, QR code generation, and WebRTC file transfer engine.
2. **Backend (`api`)**: Lightweight Node.js service providing `/api/v1` REST endpoints, short link redirect resolution, and `/signal` WebSocket signaling. Persistent state is stored in atomic `/data/koza.json`.
3. **TURN Relay (`coturn`, optional)**: STUN/TURN fallback server for clients behind restrictive symmetric NATs.

---

## Deployment Methods

### 1. Dokploy (Recommended for PaaS VPS)

Koza includes native Dokploy configuration:

1. Open your Dokploy instance (`https://your-panel-domain.com`).
2. Go to **Projects** → Select or Create **koza** → **Add Service** → **Compose**.
3. Choose **GitHub**:
   - Repository: `dimskoff/koza` (or your fork)
   - Branch: `main`
   - Compose Path: `infra/dokploy-compose.yml`
4. Configure Environment Variables in Dokploy:
   ```env
   KOZA_ADMIN_KEY=your_random_secret_hex_key
   KOZA_BASE_URL=https://koza.yourdomain.com
   KOZA_HOST=koza.yourdomain.com
   KOZA_BOX_HOST=box.yourdomain.com
   KOZA_TURN_SECRET=your_turn_hmac_secret
   ```
5. Click **Deploy**. Dokploy pulls the repo, builds the containers, hooks them into `dokploy-network`, and Traefik handles Let's Encrypt certificates and `/signal` WebSocket routing automatically.

---

### 2. Standalone Docker Compose (Any Server)

1. Clone the repo and navigate to directory:
   ```bash
   git clone https://github.com/dimskoff/koza.git
   cd koza
   ```

2. Copy and configure `.env`:
   ```bash
   cp .env.example .env
   ```

3. Launch the complete stack:
   ```bash
   # Standard stack (Frontend on :3000, API on :8787)
   docker compose up -d --build

   # With automatic HTTPS (Let's Encrypt via Caddy on :80/:443)
   docker compose --profile proxy up -d --build

   # With TURN relay fallback (for NAT punchthrough)
   docker compose --profile turn up -d --build
   ```

---

## Configuring Coturn (TURN Relay)

By default, WebRTC connects direct peer-to-peer using public STUN servers. For the ~10-15% of users behind enterprise firewalls or symmetric NAT:

1. Generate a 24-byte hex secret:
   ```bash
   openssl rand -hex 24
   ```
2. Set `KOZA_TURN_SECRET` in `.env`.
3. Open ports on your server firewall:
   - `3478/udp` and `3478/tcp` (Signaling & STUN)
   - `49160-49200/udp` (Relay UDP range)
4. Restart with the `turn` profile enabled:
   ```bash
   docker compose --profile turn up -d
   ```

---

## Data Persistence & Backups

All short links and active rooms are stored inside `/data/koza.json` in the named volume `koza-data`.
To create an offline backup:

```bash
docker run --rm -v koza_koza-data:/data -v $(pwd):/backup alpine tar czf /backup/koza-backup.tar.gz -C /data .
```

To restore:
```bash
docker run --rm -v koza_koza-data:/data -v $(pwd):/backup alpine tar xzf /backup/koza-backup.tar.gz -C /data
```

---

## Security & Privacy Guarantee

- **Zero Content Logging**: No files or data transferred via Box ever touch server disk or RAM.
- **DTLS/SRTP**: End-to-end encryption is mandatory in WebRTC RTCDataChannel.
- **Salted Scrypt**: Link and room passwords are hashed with unique per-link salts.
- **Admin Access**: Destruction endpoints require `x-koza-key` when `KOZA_ADMIN_KEY` is configured.
