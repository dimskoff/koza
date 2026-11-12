<div align="center">

# koza

**Privacy-first URL shortener and browser-to-browser file transfer.**
No accounts, no ads, no analytics. Self-hostable with one `docker compose up`.

[![License: MPL 2.0](https://img.shields.io/badge/License-MPL_2.0-brightgreen.svg)](./LICENSE)

[**koza.click**](https://koza.click) · [**box.koza.click**](https://box.koza.click) · [Status](https://koza.click/status) · [API](https://koza.click/docs)

</div>

---

## What it does

### 🔗 Short links — `koza.click`
- No accounts, no tracking cookies. Your own links are listed only in your browser (`localStorage`).
- Custom slugs (`koza.click/gh`), QR codes, click counter.
- Optional password per link — salted `scrypt`, unlocked server-side.
- Abuse guards: private/LAN addresses, URLs with embedded credentials and links back to the
  service itself are refused; optional domain blocklist and Google Safe Browsing check.

### 📦 File transfer — `box.koza.click`
- Drop files, share a 6-character code or link, the receiver downloads them.
- **Direct mode (preferred):** WebRTC data channel between the two browsers, encrypted with
  DTLS. Files don't pass through the server.
- **Relay mode (fallback):** when a direct connection is impossible (strict NAT, VPN, CGNAT)
  the data is relayed through the koza server over TLS WebSockets. It passes **through server
  memory in transit and is never written to disk** — but in this mode the server operator is
  technically able to see it. The UI shows which mode is active.
- Rooms expire after 1 hour; optional room password (salted `scrypt`).
- No file size limit in direct mode beyond what the browser can handle.

> **Honest threat model:** koza protects you from storage and logging, not from a malicious
> operator of the instance you use. If that matters, self-host it.

---

## Architecture

```
browser ──HTTPS──► reverse proxy (Traefik / Caddy)
                     ├── /signal, /api/v1/box/stream/*  ──► api  :8787  (server/server.js)
                     └── everything else                ──► web  :3000  (Next.js)
                                                               └─ /api/v1/* proxied to api

api: redirects · link + room registry (JSON file in /data) · WebRTC signaling · relay
web: UI only — holds no state
coturn (optional): TURN relay for WebRTC behind symmetric NAT
```

- **`server/server.js`** — a single dependency-light Node process (`ws` only).
  Data: `/data/koza.json`, written atomically.
- **`src/`** — Next.js 16 / React 19 UI. Domains are read from env **at runtime**, so one
  image serves any domain.

---

## Self-hosting

### Docker Compose

```bash
git clone https://github.com/dimskoff/koza.git && cd koza
cp .env.example .env          # set KOZA_HOST, KOZA_BOX_HOST, KOZA_ADMIN_KEY
docker compose --profile proxy up -d --build     # with automatic HTTPS via Caddy
```

Point the DNS A records of both hosts at the server. Add `--profile turn` for the TURN relay
(open `3478/udp+tcp` and `49160-49200/udp`).

Local development without a domain: leave the defaults (`localhost:3000` /
`box.localhost:3000`) and run `docker compose up -d --build`. Browsers resolve
`*.localhost` to `127.0.0.1` automatically.

### Dokploy (Traefik)

1. **Add Service → Compose**, source: this repo, compose path `infra/dokploy-compose.yml`.
2. Environment:
   ```env
   KOZA_HOST=koza.example.com
   KOZA_BOX_HOST=box.koza.example.com
   KOZA_ADMIN_KEY=<openssl rand -hex 24>
   KOZA_TURN_SECRET=<openssl rand -hex 24>
   ```
3. Deploy. Traefik issues certificates and routes `/signal` + relay streams to the api.

### Without Docker

```bash
npm install && (cd server && npm install)
npm run dev:api        # api on :8787
npm run dev            # web on :3000
```

### Configuration

All variables are documented in [`.env.example`](./.env.example). The important ones:

| Variable | Default | Purpose |
| --- | --- | --- |
| `KOZA_HOST` | `localhost:3000` | Main (short link) host. Everything else is derived from it. |
| `KOZA_BOX_HOST` | `box.<KOZA_HOST>` | File transfer host. |
| `KOZA_ADMIN_KEY` | *(empty)* | Enables admin endpoints. **Empty = admin endpoints disabled.** |
| `KOZA_TRUST_PROXY` | `1` | Proxy hops appending `X-Forwarded-For` (for rate limiting). `0` = ignore header. |
| `KOZA_CORS_ORIGINS` | base + box URL | Extra origins allowed to call the API from a browser. |
| `KOZA_BLOCKED_DOMAINS` | — | Comma list of domains that can't be shortened. `/data/blocklist.txt` is also read. |
| `KOZA_SAFE_BROWSING_KEY` | — | Google Safe Browsing v4 key for destination checks. |
| `KOZA_TURN_SECRET` | — | coturn `use-auth-secret`; enables TURN credentials. |
| `KOZA_ROOM_TTL_MS` | `3600000` | Room lifetime. |

### Backups

```bash
docker run --rm -v koza_koza-data:/data -v "$PWD":/backup alpine tar czf /backup/koza.tgz -C /data .
```

---

## API

Interactive docs: [`/docs`](https://koza.click/docs). Machine-readable index: `GET /api/v1`.

```bash
# create a short link
curl -X POST https://koza.click/api/v1/shorten \
  -H 'content-type: application/json' \
  -d '{"url": "https://github.com", "slug": "gh"}'

# open a file-transfer room
curl -X POST https://koza.click/api/v1/box/rooms \
  -H 'content-type: application/json' \
  -d '{"files": [{"name": "archive.zip", "size": 10485760}]}'
```

| Endpoint | Auth |
| --- | --- |
| `POST /shorten`, `GET /links/{slug}`, `POST /links/{slug}/unlock` | public, rate limited |
| `POST /box/rooms`, `GET /box/rooms/{code}` | public, rate limited |
| `DELETE /box/rooms/{code}` | `x-koza-token` (sender) or admin |
| `GET /links`, `GET /box/rooms`, `DELETE /links/{slug}` | admin (`x-koza-key`) |

Secrets (sender token, room password, admin key) are accepted **only in headers**, never in
query strings.

### CLI

```bash
KOZA_URL=https://koza.click ./cli/koza.sh shorten https://news.ycombinator.com hn
KOZA_URL=https://koza.click KOZA_ADMIN_KEY=… ./cli/koza.sh list
```

---

## Development

```bash
npm run check                      # eslint + tsc
node scripts/test-comprehensive.js # backend integration tests (api must run on :8787)
```

Project layout:

```
server/server.js        api: redirects, registry, signaling, relay
src/app/                Next.js routes (api/v1/[[...path]] is a thin proxy)
src/components/koza/    shortener UI
src/components/box/     file transfer UI + WebRTC engine (webrtc.ts)
src/lib/site.ts         runtime domain config shared by server and client
infra/                  Caddyfile, Dokploy compose, coturn config
```

## License

[MPL-2.0](./LICENSE). If you run a modified version, keep its source available
(`KOZA_REPO_URL` controls the footer link).
