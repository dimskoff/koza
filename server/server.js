#!/usr/bin/env node
/* ────────────────────────────────────────────────────────────────────────
   koza server — the whole backend in one file.

     · link shortener  — http api + 302 redirects, clicks counted
     · box registry    — rooms staged by the sender, resolved by code
     · p2p signaling   — one websocket endpoint (/signal) relays the
                         webrtc handshake so files go browser → browser

   storage: a single json file with atomic writes. no database.
   deps:    ws (the only one). node 18+.

   run:   node server.js                       → http + ws on :8787

   env    PORT              port               (default 8787)
          KOZA_DATA_DIR     data folder        (default ./data)
          KOZA_ADMIN_KEY    gates DELETEs      (empty = open)
          KOZA_BASE_URL     public origin      (default: from request)
          KOZA_ROOM_TTL_MS  room lifetime      (default 1 hour)

   ── signaling protocol (json over one websocket) ──────────────────────
     client → server   { type: "join", code, role: "sender"|"receiver",
                         token?, password? }
     server → client   { type: "joined", role, peers }
                       { type: "peer-joined" } | { type: "peer-left" }
                       { type: "error", reason }
                         bad-join · no-room · wrong-token · wrong-password
     relayed both ways { type: "offer" | "answer" | "ice" | "bye", ...from }

   the sender proves ownership with the sender_token returned by
   POST /api/v1/box/rooms. a receiver proves access with the room
   password when the room is locked. everything after the handshake is
   peer-to-peer — the server only relays connection metadata.
   ──────────────────────────────────────────────────────────────────── */

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { WebSocketServer } = require("ws");

/* ── config ─────────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.KOZA_DATA_DIR || path.join(__dirname, "data");
const ADMIN_KEY = process.env.KOZA_ADMIN_KEY || "";
const FIXED_BASE = (process.env.KOZA_BASE_URL || "").replace(/\/+$/, "");
const ROOM_TTL_MS = Number(process.env.KOZA_ROOM_TTL_MS || 60 * 60 * 1000);

/* coturn "use-auth-secret" — the browser asks us for short-lived turn
   credentials, we hmac-sign them with the shared secret. without
   KOZA_TURN_SECRET the endpoint just reports turn: null. */
const TURN_SECRET = process.env.KOZA_TURN_SECRET || "";
const TURN_URLS = (process.env.KOZA_TURN_URLS || "turn:koza.click:3478?transport=udp,turn:koza.click:3478?transport=tcp")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_TTL_S = Number(process.env.KOZA_TURN_TTL_S || 3600);

/* ── storage: one json file, atomic replace ─────────────────────────── */
const DATA_FILE = path.join(DATA_DIR, "koza.json");
let db = { links: {}, rooms: {} };

function loadDb() {
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    /* fresh start */
  }
}

function saveDb() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    try {
      fs.renameSync(tmp, DATA_FILE);
    } catch {
      fs.copyFileSync(tmp, DATA_FILE);
      try {
        fs.unlinkSync(tmp);
      } catch {
        /* best-effort cleanup */
      }
    }
  } catch (err) {
    console.error("[koza] persist failed:", err.message);
  }
}

/* ── ids, hashing, validation ───────────────────────────────────────── */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no lookalikes
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no lookalikes
const SLUG_RE = /^[a-z0-9_-]{3,32}$/;

const RESERVED = new Set([
  "api",
  "docs",
  "box",
  "r",
  "room",
  "self-host",
  "favicon.ico",
  "robots.txt",
  "_next",
  "static",
]);

function randomFrom(alphabet, len) {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function hashPass(pw, salt) {
  return crypto.scryptSync(String(pw), String(salt), 16).toString("hex");
}

function newSalt() {
  return crypto.randomBytes(8).toString("hex");
}

/* tiny digest kept for compatibility with the demo box client, which
   publishes rooms as a djb2 hash instead of a plaintext password */
function djb2(pw) {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length === 0 || ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* stored password: { kind: "scrypt" | "demo", salt, hash } */
function verifyPass(stored, pw) {
  if (!stored) return true;
  if (stored.kind === "demo") return safeEqual(stored.hash, djb2(String(pw)));
  return safeEqual(stored.hash, hashPass(pw, stored.salt));
}

function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/* ── http helpers ───────────────────────────────────────────────────── */
function originOf(req) {
  if (FIXED_BASE) return FIXED_BASE;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

function sendJson(res, req, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": req.headers.origin || "*",
    "access-control-allow-headers": "content-type, x-koza-key",
    "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error("body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  return JSON.parse(raw);
}

function authorized(req) {
  if (!ADMIN_KEY) return true;
  return (req.headers["x-koza-key"] || "") === ADMIN_KEY;
}

/* ── wire shapes (mirror the docs page) ─────────────────────────────── */
function publicLink(l, origin) {
  return {
    slug: l.slug,
    url: l.url,
    short_url: `${origin}/${l.slug}`,
    password: !!l.password,
    clicks: l.clicks,
    created_at: new Date(l.createdAt).toISOString(),
  };
}

function roomExpiry(r) {
  return r.createdAt + ROOM_TTL_MS;
}

function publicRoom(r, origin) {
  return {
    code: r.code,
    url: `${origin}/r/${r.code}`,
    password: !!r.password,
    /* the digest ships so the current receiver page can gate locally;
       moves fully server-side once the box ui speaks the signal protocol */
    password_hash: r.password ? r.password.hash : null,
    files: r.files,
    created_at: new Date(r.createdAt).toISOString(),
    expires_at: new Date(roomExpiry(r)).toISOString(),
  };
}

/* ── active signaling lines (mapped by room code) ───────────────────── */
const lines = new Map(); // code → { sender: ws|null, receiver: ws|null }

function sendWs(ws, obj) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* ignore failed write */
    }
  }
}

function closeLine(code, reason = "room-closed") {
  const line = lines.get(code);
  if (!line) return;
  lines.delete(code);
  for (const peer of [line.sender, line.receiver]) {
    if (peer && peer.readyState === 1) {
      peer.profile = null;
      sendWs(peer, { type: "bye", reason });
      try {
        peer.close();
      } catch {
        /* best-effort */
      }
    }
  }
}

function pruneRooms() {
  const now = Date.now();
  let changed = false;
  for (const code of Object.keys(db.rooms)) {
    if (now - db.rooms[code].createdAt > ROOM_TTL_MS) {
      delete db.rooms[code];
      closeLine(code, "room-expired");
      changed = true;
    }
  }
  if (changed) saveDb();
}
setInterval(pruneRooms, 5 * 60 * 1000).unref();

/* ── http server + routes ───────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const origin = originOf(req);
  let m;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-headers": "content-type, x-koza-key",
      "access-control-allow-methods": "GET, POST, DELETE, OPTIONS",
      "access-control-max-age": "86400",
    });
    return res.end();
  }

  try {
    /* ── system stats & dashboard ── */
    if (pathname === "/api/v1/stats" && req.method === "GET") {
      pruneRooms();
      const isAdmin = authorized(req);
      const allLinks = Object.values(db.links);
      const totalClicks = allLinks.reduce((acc, l) => acc + (l.clicks || 0), 0);
      const activeRooms = Object.values(db.rooms).map((r) => publicRoom(r, origin));

      const stats = {
        links_count: allLinks.length,
        total_clicks: totalClicks,
        rooms_count: activeRooms.length,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
        turn_enabled: Boolean(TURN_SECRET),
        ws_clients: wss.clients ? wss.clients.size : 0,
        is_admin: isAdmin,
        links: isAdmin
          ? allLinks
              .sort((a, b) => b.createdAt - a.createdAt)
              .map((l) => publicLink(l, origin))
          : undefined,
        rooms: isAdmin ? activeRooms : undefined,
      };
      return sendJson(res, req, 200, stats);
    }

    /* ── index ── */
    if (pathname === "/api/v1" && req.method === "GET") {
      return sendJson(res, req, 200, {
        name: "koza api",
        version: "v1",
        base_url: `${origin}/api/v1`,
        description:
          "Short links and direct file lines over plain HTTP. No keys, no tokens — be nice.",
        docs: `${origin}/docs`,
        endpoints: {
          shortener: {
            "POST /shorten": "create a short link — { url, slug?, password? }",
            "GET /links": "list every link on this server",
            "GET /links/{slug}": "look up one link, clicks included",
            "POST /links/{slug}/hit": "count a click",
            "POST /links/{slug}/unlock": "trade a password for the destination url",
            "DELETE /links/{slug}": "burn a link (x-koza-key when admin key is set)",
          },
          box: {
            "POST /box/rooms":
              "open a direct line — { password?, files? } → { room, sender_token }",
            "GET /box/rooms/{code}": "inspect a line: staged files, lock state, expiry",
            "DELETE /box/rooms/{code}": "close the line early",
            "GET /turn": "short-lived turn credentials for the webrtc handshake",
            "WS /signal": "p2p handshake relay — see the protocol at the top of server.js",
          },
        },
        notes: [
          "single json file storage — data survives restarts",
          "rooms expire after one hour",
          "passwords are salted scrypt, never stored in plain text",
          "delete endpoints honor x-koza-key when KOZA_ADMIN_KEY is set",
        ],
      });
    }

    /* ── shortener ── */
    if (pathname === "/api/v1/shorten" && req.method === "POST") {
      const body = await readJson(req);
      const normalized = normalizeUrl(body.url);
      if (!normalized) {
        return sendJson(res, req, 400, { error: "invalid url — try https://example.com" });
      }

      let slug = "";
      if (body.slug) {
        slug = String(body.slug).trim().toLowerCase();
        if (!SLUG_RE.test(slug)) {
          return sendJson(res, req, 400, {
            error: "invalid slug — 3-32 chars, lowercase a-z / 0-9 / dashes",
          });
        }
        if (RESERVED.has(slug)) {
          return sendJson(res, req, 409, { error: "this name is reserved" });
        }
        if (db.links[slug]) {
          return sendJson(res, req, 409, { error: "slug already taken" });
        }
      } else {
        do {
          slug = randomFrom(SLUG_ALPHABET, 6);
        } while (db.links[slug]);
      }

      const pw = typeof body.password === "string" ? body.password.trim() : "";
      if (pw && pw.length < 4) {
        return sendJson(res, req, 400, { error: "password too short — at least 4 characters" });
      }

      const salt = newSalt();
      const link = {
        slug,
        url: normalized,
        password: pw ? { kind: "scrypt", salt, hash: hashPass(pw, salt) } : null,
        clicks: 0,
        createdAt: Date.now(),
      };
      db.links[slug] = link;
      saveDb();
      return sendJson(res, req, 201, { link: publicLink(link, origin) });
    }

    if (pathname === "/api/v1/links" && req.method === "GET") {
      const links = Object.values(db.links)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((l) => publicLink(l, origin));
      return sendJson(res, req, 200, { count: links.length, links });
    }

    if ((m = pathname.match(/^\/api\/v1\/links\/([^/]+)$/))) {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const link = db.links[slug];

      if (req.method === "GET") {
        if (!link) return sendJson(res, req, 404, { error: "no such link" });
        return sendJson(res, req, 200, { link: publicLink(link, origin) });
      }

      if (req.method === "DELETE") {
        if (!authorized(req)) return sendJson(res, req, 401, { error: "admin key required" });
        if (!link) return sendJson(res, req, 404, { error: "no such link" });
        delete db.links[slug];
        saveDb();
        return sendJson(res, req, 200, { deleted: true, slug });
      }
    }

    if ((m = pathname.match(/^\/api\/v1\/links\/([^/]+)\/hit$/)) && req.method === "POST") {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const link = db.links[slug];
      if (!link) return sendJson(res, req, 404, { error: "no such link" });
      link.clicks += 1;
      saveDb();
      return sendJson(res, req, 200, { slug, clicks: link.clicks });
    }

    if ((m = pathname.match(/^\/api\/v1\/links\/([^/]+)\/unlock$/)) && req.method === "POST") {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const link = db.links[slug];
      if (!link) return sendJson(res, req, 404, { error: "no such link" });
      if (!link.password) return sendJson(res, req, 200, { url: link.url, unlocked: true });
      const body = await readJson(req);
      const pw = typeof body.password === "string" ? body.password : "";
      if (!verifyPass(link.password, pw)) {
        return sendJson(res, req, 403, { error: "wrong password" });
      }
      return sendJson(res, req, 200, { url: link.url, unlocked: true });
    }

    /* ── box rooms ── */
    if (pathname === "/api/v1/box/rooms" && req.method === "POST") {
      pruneRooms();
      const body = await readJson(req);

      const files = Array.isArray(body.files)
        ? body.files.slice(0, 32).map((f) => ({
            name: String((f && f.name) || "file").slice(0, 255),
            size: Math.max(0, Number(f && f.size) || 0),
          }))
        : [];

      let password = null;
      if (typeof body.password === "string" && body.password.trim()) {
        const pw = body.password.trim();
        if (pw.length < 4) {
          return sendJson(res, req, 400, { error: "password too short — at least 4 characters" });
        }
        const salt = newSalt();
        password = { kind: "scrypt", salt, hash: hashPass(pw, salt) };
      } else if (typeof body.passwordHash === "string" && body.passwordHash) {
        /* compat: the demo box client stages a precomputed digest */
        password = { kind: "demo", salt: "", hash: body.passwordHash };
      }

      let code = "";
      do {
        code = randomFrom(CODE_ALPHABET, 6);
      } while (db.rooms[code]);

      const room = {
        code,
        password,
        files,
        createdAt: Date.now(),
        senderToken: crypto.randomBytes(24).toString("hex"),
      };
      db.rooms[code] = room;
      saveDb();
      return sendJson(res, req, 201, {
        room: publicRoom(room, origin),
        sender_token: room.senderToken,
      });
    }

    if (pathname === "/api/v1/box/rooms" && req.method === "GET") {
      pruneRooms();
      const rooms = Object.values(db.rooms)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => publicRoom(r, origin));
      return sendJson(res, req, 200, { count: rooms.length, rooms });
    }

    if ((m = pathname.match(/^\/api\/v1\/box\/rooms\/([^/]+)$/))) {
      const code = decodeURIComponent(m[1]).toUpperCase();
      const room = db.rooms[code];

      if (req.method === "GET") {
        pruneRooms();
        if (!room) return sendJson(res, req, 404, { error: "no such room (or it expired)" });
        return sendJson(res, req, 200, { room: publicRoom(room, origin) });
      }

      if (req.method === "DELETE") {
        /* admin key — or the sender closing their own line with its token */
        const ownToken = req.headers["x-koza-token"] || "";
        const own = room && ownToken && room.senderToken && safeEqual(room.senderToken, String(ownToken));
        if (!authorized(req) && !own) {
          return sendJson(res, req, 401, { error: "admin key required" });
        }
        if (!room) return sendJson(res, req, 404, { error: "no such room (or it expired)" });
        delete db.rooms[code];
        closeLine(code, "room-deleted");
        saveDb();
        return sendJson(res, req, 200, { deleted: true, code });
      }
    }

    /* ── turn credentials (coturn use-auth-secret) ── */
    if (pathname === "/api/v1/turn" && req.method === "GET") {
      if (!TURN_SECRET) {
        return sendJson(res, req, 200, { turn: null, note: "no turn on this server — stun only" });
      }
      const expiry = Math.floor(Date.now() / 1000) + TURN_TTL_S;
      const username = `${expiry}:koza`;
      const credential = crypto.createHmac("sha1", TURN_SECRET).update(username).digest("base64");
      return sendJson(res, req, 200, {
        turn: { urls: TURN_URLS, username, credential, ttl: TURN_TTL_S },
      });
    }

    /* ── the redirect itself ── */
    if (req.method === "GET" && !pathname.startsWith("/api/")) {
      const slug = pathname.slice(1).toLowerCase();
      if (slug && !RESERVED.has(slug) && SLUG_RE.test(slug) && db.links[slug]) {
        const link = db.links[slug];
        link.clicks += 1;
        saveDb();
        res.writeHead(302, { location: link.url, "cache-control": "no-store" });
        return res.end();
      }
    }

    return sendJson(res, req, 404, { error: "not found" });
  } catch (err) {
    if (err instanceof SyntaxError) {
      return sendJson(res, req, 400, { error: "body must be json" });
    }
    console.error("[koza]", err);
    return sendJson(res, req, 500, { error: "internal error" });
  }
});

/* ── websocket signaling ────────────────────────────────────────────── */
const wss = new WebSocketServer({ noServer: true });

function joinLine(ws, msg) {
  const code = String(msg.code || "").toUpperCase();
  const role = msg.role === "sender" ? "sender" : msg.role === "receiver" ? "receiver" : null;
  if (!role || !/^[A-Z0-9]{4,12}$/.test(code)) {
    return sendWs(ws, { type: "error", reason: "bad-join" });
  }

  const room = db.rooms[code];
  if (!room || Date.now() - room.createdAt > ROOM_TTL_MS) {
    delete db.rooms[code];
    closeLine(code, "no-room");
    return sendWs(ws, { type: "error", reason: "no-room" });
  }

  if (role === "sender") {
    if (!safeEqual(room.senderToken, String(msg.token || ""))) {
      return sendWs(ws, { type: "error", reason: "wrong-token" });
    }
  } else if (room.password && !verifyPass(room.password, String(msg.password ?? ""))) {
    return sendWs(ws, { type: "error", reason: "wrong-password" });
  }

  let line = lines.get(code);
  if (!line) {
    line = { sender: null, receiver: null };
    lines.set(code, line);
  }
  if (line[role] && line[role] !== ws) {
    try {
      line[role].profile = null; // detach profile so close handler won't notify peer
      line[role].terminate();
    } catch {
      /* replacing a stale peer */
    }
  }
  line[role] = ws;
  ws.profile = { code, role };

  const other = role === "sender" ? line.receiver : line.sender;
  const isPeerOnline = Boolean(other && other.readyState === 1);
  sendWs(ws, { type: "joined", role, peers: isPeerOnline ? 2 : 1 });
  if (isPeerOnline) {
    sendWs(other, { type: "peer-joined", role });
    if (role === "sender") {
      sendWs(ws, { type: "peer-ready" });
    }
  }
}

function leaveLine(ws) {
  const p = ws.profile;
  if (!p) return;
  ws.profile = null;
  const line = lines.get(p.code);
  if (!line) return;
  if (line[p.role] === ws) line[p.role] = null;
  const other = p.role === "sender" ? line.receiver : line.sender;
  if (other && other.readyState === 1) sendWs(other, { type: "peer-left" });
  if (!line.sender && !line.receiver) lines.delete(p.code);
}

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.profile = null;
  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!ws.profile) {
      if (msg && msg.type === "join") joinLine(ws, msg);
      else sendWs(ws, { type: "error", reason: "join first" });
      return;
    }

    if (msg && typeof msg.type === "string" && msg.type !== "join") {
      const line = lines.get(ws.profile.code);
      if (!line) return;
      const peer = ws.profile.role === "sender" ? line.receiver : line.sender;
      if (peer && peer.readyState === 1) {
        msg.from = ws.profile.role;
        sendWs(peer, msg);
      }
    }
  });

  ws.on("close", () => leaveLine(ws));
  ws.on("error", () => {
    try {
      ws.terminate();
    } catch {
      /* already gone */
    }
    leaveLine(ws);
  });
});

/* kill dead sockets */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {
      /* closing anyway */
    }
  }
}, 30_000).unref();

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname !== "/signal") return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

/* ── boot ───────────────────────────────────────────────────────────── */
loadDb();
server.listen(PORT, () => {
  console.log(`[koza] listening on :${PORT}  ·  data: ${DATA_FILE}`);
  if (!ADMIN_KEY) console.log("[koza] KOZA_ADMIN_KEY empty — DELETE endpoints are open");
});

process.on("SIGTERM", () => {
  saveDb();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
