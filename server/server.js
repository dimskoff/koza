#!/usr/bin/env node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * koza server v2.2 — high-performance zero-storage P2P & stream backend.
 *   · link shortener  — http api + 302 redirects, clicks counted
 *   · box registry    — rooms staged by the sender, resolved by code
 *   · hybrid p2p      — /signal handles WebRTC signaling AND zero-copy
 *                       binary WebSocket turbo relay (bypasses TURN-TCP
 *                       SCTP throttling on VPNs / CGNAT at full line speed)
 *   · direct stream   — /signal/stream/:code/:idx pairs HTTP upload and
 *                       download streams directly in RAM (zero disk I/O)
 */

const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const os = require("node:os");
const util = require("node:util");
const { WebSocketServer } = require("ws");

const scryptAsync = util.promisify(crypto.scrypt);

/* ── config ─────────────────────────────────────────────────────────── */
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = process.env.KOZA_DATA_DIR || path.join(__dirname, "data");
const ADMIN_KEY = process.env.KOZA_ADMIN_KEY || "";
const FIXED_BASE = (process.env.KOZA_BASE_URL || "").replace(/\/+$/, "");
const BOX_BASE = (process.env.KOZA_BOX_URL || "https://box.koza.click").replace(/\/+$/, "");
const ROOM_TTL_MS = Number(process.env.KOZA_ROOM_TTL_MS || 60 * 60 * 1000);
const MAX_FILES_PER_ROOM = 12;
const MAX_LANES_PER_ROLE = 8;

const TURN_SECRET = process.env.KOZA_TURN_SECRET || "";
const TURN_URLS = (
  process.env.KOZA_TURN_URLS ||
  "turn:koza.click:3478?transport=udp,turn:koza.click:3478?transport=tcp"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const TURN_TTL_S = Number(process.env.KOZA_TURN_TTL_S || 3600);

/* ── runtime telemetry ──────────────────────────────────────────────── */
const telemetry = {
  bootedAt: Date.now(),
  totalRoomsCreated: 0,
  totalBytesRelayed: 0,
  totalFramesRelayed: 0,
  activeStreams: 0,
};

/* ── storage: one json file, atomic replace ─────────────────────────── */
const DATA_FILE = path.join(DATA_DIR, "koza.json");
let db = { links: {}, rooms: {}, meta: { totalRoomsCreated: 0, totalBytesRelayed: 0 } };

function loadDb() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    db = {
      links: parsed.links || {},
      rooms: parsed.rooms || {},
      meta: parsed.meta || { totalRoomsCreated: 0, totalBytesRelayed: 0 },
    };
    telemetry.totalRoomsCreated = db.meta.totalRoomsCreated || 0;
    telemetry.totalBytesRelayed = db.meta.totalBytesRelayed || 0;
  } catch {
    /* fresh start */
  }
}

let saveInFlight = false;
let saveQueued = false;

async function flushDbAsync() {
  if (saveInFlight) {
    saveQueued = true;
    return;
  }
  saveInFlight = true;
  try {
    db.meta = {
      totalRoomsCreated: telemetry.totalRoomsCreated,
      totalBytesRelayed: telemetry.totalBytesRelayed,
    };
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
    const payload = JSON.stringify(db, null, 2);
    await fsp.writeFile(tmp, payload, "utf8");
    try {
      await fsp.rename(tmp, DATA_FILE);
    } catch {
      await fsp.copyFile(tmp, DATA_FILE);
      try {
        await fsp.unlink(tmp);
      } catch {}
    }
  } catch (err) {
    console.error("[koza] persist failed:", err.message);
  } finally {
    saveInFlight = false;
    if (saveQueued) {
      saveQueued = false;
      setImmediate(flushDbAsync);
    }
  }
}

function saveDb() {
  setImmediate(flushDbAsync);
}

function saveDbSync() {
  try {
    db.meta = {
      totalRoomsCreated: telemetry.totalRoomsCreated,
      totalBytesRelayed: telemetry.totalBytesRelayed,
    };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.sync.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
    try {
      fs.renameSync(tmp, DATA_FILE);
    } catch {
      fs.copyFileSync(tmp, DATA_FILE);
      try {
        fs.unlinkSync(tmp);
      } catch {}
    }
  } catch {}
}

/* ── ids, hashing, validation ───────────────────────────────────────── */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // 32 chars (256 % 32 === 0)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars (256 % 32 === 0)
const SLUG_RE = /^[a-z0-9_-]{3,32}$/;

const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "mail",
  "blog",
  "status",
  "docs",
  "help",
  "login",
  "signup",
  "dashboard",
  "beta",
  "about",
  "terms",
  "privacy",
  "abuse",
  "report",
  "box",
  "r",
  "room",
  "signal",
  "stream",
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

async function hashPass(pw, salt) {
  const derived = await scryptAsync(String(pw), String(salt), 16);
  return derived.toString("hex");
}

function newSalt() {
  return crypto.randomBytes(8).toString("hex");
}

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

async function verifyPass(stored, pw) {
  if (!stored) return true;
  if (stored.kind === "demo") return safeEqual(stored.hash, djb2(String(pw)));
  const hashed = await hashPass(pw, stored.salt);
  return safeEqual(stored.hash, hashed);
}

function normalizeUrl(raw) {
  if (typeof raw !== "string") return null;
  let value = raw.trim();
  if (!value) return null;
  if (!/^https?:\/\//i.test(value)) value = `https://${value}`;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (!u.hostname || /\s/.test(u.hostname)) return null;
    if (u.hostname !== "localhost" && !u.hostname.includes(".")) return null;
    return u.toString();
  } catch {
    return null;
  }
}

function computeRoomFingerprint(code, files, createdAt) {
  const payload = `${code}:${createdAt}:${files.map((f) => `${f.name}:${f.size}`).join("|")}`;
  const hex = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16).toUpperCase();
  return `${hex.slice(0, 4)}·${hex.slice(4, 8)}·${hex.slice(8, 12)}·${hex.slice(12, 16)}`;
}

/* ── rate limiter (in-memory sliding window per IP) ─────────────────── */
const rateBuckets = new Map();

function clientIp(req) {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) return xff.split(",")[0].trim();
  return req.socket?.remoteAddress || "unknown";
}

function allowRate(req, keyPrefix, maxReqs, windowMs) {
  const ip = clientIp(req);
  if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return true;
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();
  let entry = rateBuckets.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 1, resetAt: now + windowMs };
    rateBuckets.set(key, entry);
    return true;
  }
  entry.count += 1;
  return entry.count <= maxReqs;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateBuckets) {
    if (now > v.resetAt) rateBuckets.delete(k);
  }
}, 60_000).unref();

/* ── http helpers ───────────────────────────────────────────────────── */
function originOf(req) {
  if (FIXED_BASE) return FIXED_BASE;
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

function boxOriginOf(req) {
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "");
  const proto = req.headers["x-forwarded-proto"] || "https";
  if (host.startsWith("box.")) return `${proto}://${host}`;
  if (host.includes("localhost") || host.startsWith("127.")) return `${proto}://${host}`;
  return BOX_BASE;
}

function sendJson(res, req, status, obj) {
  if (res.headersSent) return;
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "access-control-allow-origin": req.headers.origin || "*",
    "access-control-allow-headers":
      "content-type, x-koza-key, x-koza-admin-key, x-koza-token, x-koza-password",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "cache-control": "no-store",
  });
  res.end(body);
}

function readBody(req, limit = 128 * 1024) {
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
  const key = req.headers["x-koza-key"] || req.headers["x-koza-admin-key"] || "";
  return safeEqual(String(key), ADMIN_KEY);
}

/* ── active signaling lines & direct HTTP stream pipes ──────────────── */
const lines = new Map(); // code → { sender, receiver, senderLanes, receiverLanes, bytesRelayed }
const streamPipes = new Map(); // `${code}:${idx}` → { senderReq?, receiverRes?, timer }

function sendWs(ws, obj) {
  if (ws && ws.readyState === 1 /* OPEN */) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* ignore failed write */
    }
  }
}

function clearWsPause(ws) {
  if (!ws) return;
  if (ws._pauseTimer) {
    clearInterval(ws._pauseTimer);
    ws._pauseTimer = null;
  }
  if (ws._pauseTimeout) {
    clearTimeout(ws._pauseTimeout);
    ws._pauseTimeout = null;
  }
  try {
    if (ws._socket && ws._socket.isPaused()) {
      ws._socket.resume();
    }
  } catch {}
}

function closeLine(code, reason = "room-closed") {
  const line = lines.get(code);
  if (!line) return;
  const hadBytes = (line.bytesRelayed || 0) > 0;
  lines.delete(code);
  const allPeers = new Set([
    line.sender,
    line.receiver,
    ...(line.senderLanes || []),
    ...(line.receiverLanes || []),
  ]);
  for (const peer of allPeers) {
    if (peer) {
      clearWsPause(peer);
      peer.profile = null;
      if (peer.readyState === 1) {
        sendWs(peer, { type: "bye", reason });
        try {
          peer.close();
        } catch {}
      }
    }
  }
  if (hadBytes) saveDb();
}

/* ── wire shapes ────────────────────────────────────────────────────── */
function publicLink(l, origin, includeProtectedUrl = false) {
  const isLocked = Boolean(l.password);
  return {
    slug: l.slug,
    url: isLocked && !includeProtectedUrl ? null : l.url,
    short_url: `${origin}/${l.slug}`,
    password: isLocked,
    clicks: l.clicks,
    created_at: new Date(l.createdAt).toISOString(),
  };
}

function roomExpiry(r) {
  return r.createdAt + ROOM_TTL_MS;
}

function publicRoom(r, req) {
  const boxOrigin = boxOriginOf(req);
  const line = lines.get(r.code);
  const senderOnline = Boolean(line?.sender && line.sender.readyState === 1);
  const receiverOnline = Boolean(line?.receiver && line.receiver.readyState === 1);
  return {
    code: r.code,
    url: `${boxOrigin}/r/${r.code}`,
    password: Boolean(r.password),
    fingerprint: r.fingerprint || computeRoomFingerprint(r.code, r.files || [], r.createdAt),
    files: r.files,
    sender_online: senderOnline,
    receiver_online: receiverOnline,
    bytes_relayed: line?.bytesRelayed || 0,
    created_at: new Date(r.createdAt).toISOString(),
    expires_at: new Date(roomExpiry(r)).toISOString(),
  };
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

/* ── direct zero-storage HTTP stream pipe handler ───────────────────── */
async function handleDirectStream(req, res, code, fileIdx, url) {
  const room = db.rooms[code];
  if (!room || Date.now() - room.createdAt > ROOM_TTL_MS) {
    return sendJson(res, req, 404, { error: "no such room" });
  }
  const fileMeta = room.files[fileIdx] || { name: `file-${fileIdx}`, size: 0 };
  const key = `${code}:${fileIdx}`;

  if (req.method === "POST" || req.method === "PUT") {
    const token = req.headers["x-koza-token"] || url.searchParams.get("token") || "";
    if (!safeEqual(room.senderToken, String(token))) {
      return sendJson(res, req, 401, { error: "invalid sender token" });
    }
    let slot = streamPipes.get(key);
    if (!slot) {
      slot = {};
      streamPipes.set(key, slot);
    }
    if (slot.senderTimer) clearTimeout(slot.senderTimer);
    slot.senderReq = req;
    slot.senderRes = res;

    req.socket?.setNoDelay?.(true);
    if (slot.receiverRes) {
      bridgeHttpStreams(key, slot, fileMeta);
    } else {
      slot.senderTimer = setTimeout(() => {
        if (streamPipes.get(key) === slot && !slot.piped) {
          streamPipes.delete(key);
          if (!res.headersSent) sendJson(res, req, 408, { error: "receiver timeout" });
        }
      }, 30_000);
    }
    return;
  }

  if (req.method === "GET") {
    const pw = url.searchParams.get("password") || req.headers["x-koza-password"] || "";
    if (room.password && !(await verifyPass(room.password, String(pw)))) {
      return sendJson(res, req, 403, { error: "wrong password" });
    }
    let slot = streamPipes.get(key);
    if (!slot) {
      slot = {};
      streamPipes.set(key, slot);
    }
    if (slot.receiverTimer) clearTimeout(slot.receiverTimer);
    slot.receiverReq = req;
    slot.receiverRes = res;

    res.socket?.setNoDelay?.(true);
    if (slot.senderReq) {
      bridgeHttpStreams(key, slot, fileMeta);
    } else {
      slot.receiverTimer = setTimeout(() => {
        if (streamPipes.get(key) === slot && !slot.piped) {
          streamPipes.delete(key);
          if (!res.headersSent) sendJson(res, req, 408, { error: "sender timeout" });
        }
      }, 30_000);
    }
    return;
  }

  return sendJson(res, req, 405, { error: "method not allowed" });
}

function bridgeHttpStreams(key, slot, fileMeta) {
  if (slot.piped) return;
  slot.piped = true;
  if (slot.senderTimer) clearTimeout(slot.senderTimer);
  if (slot.receiverTimer) clearTimeout(slot.receiverTimer);
  telemetry.activeStreams += 1;

  const { senderReq, senderRes, receiverRes } = slot;
  const safeName = encodeURIComponent(fileMeta.name || "download.bin");
  const headers = {
    "content-type": "application/octet-stream",
    "content-disposition": `attachment; filename*=UTF-8''${safeName}`,
    "access-control-allow-origin": "*",
    "cache-control": "no-store",
  };
  if (fileMeta.size > 0) headers["content-length"] = String(fileMeta.size);

  receiverRes.writeHead(200, headers);
  let moved = 0;

  senderReq.on("data", (chunk) => {
    moved += chunk.length;
    telemetry.totalBytesRelayed += chunk.length;
  });

  senderReq.pipe(receiverRes, { end: true });

  const cleanup = () => {
    if (slot.cleaned) return;
    slot.cleaned = true;
    telemetry.activeStreams = Math.max(0, telemetry.activeStreams - 1);
    streamPipes.delete(key);
    if (moved > 0) saveDb();
  };

  senderReq.on("end", () => {
    cleanup();
    try {
      receiverRes.end();
    } catch {}
    try {
      if (!senderRes.headersSent) {
        const body = JSON.stringify({ ok: true, bytes: moved });
        senderRes.writeHead(200, {
          "content-type": "application/json",
          "access-control-allow-origin": "*",
        });
        senderRes.end(body);
      }
    } catch {}
  });

  senderReq.on("error", () => {
    cleanup();
    try {
      receiverRes.destroy();
    } catch {}
  });

  receiverRes.on("close", () => {
    cleanup();
    try {
      senderReq.destroy();
    } catch {}
  });
}

/* ── http server + routes ───────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  const pathname = url.pathname.replace(/\/+$/, "") || "/";
  const origin = originOf(req);
  let m;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": req.headers.origin || "*",
      "access-control-allow-headers":
        "content-type, x-koza-key, x-koza-admin-key, x-koza-token, x-koza-password",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      "access-control-max-age": "86400",
    });
    return res.end();
  }

  try {
    /* ── direct cut-through stream endpoint ── */
    if (
      (m = pathname.match(/^\/(?:signal\/stream|api\/v1\/box\/stream)\/([A-Za-z0-9]+)\/(\d+)$/))
    ) {
      const code = m[1].toUpperCase();
      const idx = Number(m[2]);
      return await handleDirectStream(req, res, code, idx, url);
    }

    /* ── system stats & telemetry dashboard ── */
    if (pathname === "/api/v1/stats" && req.method === "GET") {
      pruneRooms();
      const allLinks = Object.values(db.links);
      const totalClicks = allLinks.reduce((acc, l) => acc + (l.clicks || 0), 0);
      const activeRoomsCount = Object.keys(db.rooms).length;
      const mem = process.memoryUsage();

      let activePairedLines = 0;
      for (const l of lines.values()) {
        if (l.sender?.readyState === 1 && l.receiver?.readyState === 1) {
          activePairedLines += 1;
        }
      }

      const stats = {
        status: "operational",
        version: "2.2.0",
        server_time: new Date().toISOString(),
        node_version: process.version,
        platform: `${process.platform}/${process.arch}`,
        links_count: allLinks.length,
        redirects: allLinks.length,
        total_clicks: totalClicks,
        rooms_count: activeRoomsCount,
        rooms: activeRoomsCount,
        active_lines: activePairedLines,
        uptime_seconds: Math.floor(process.uptime()),
        memory_mb: Math.round(mem.rss / 1024 / 1024),
        memory: {
          rss_mb: Math.round(mem.rss / 1024 / 1024),
          heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
          heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
        },
        cpu_cores: os.cpus()?.length || 1,
        load_avg: os.loadavg().map((n) => Number(n.toFixed(2))),
        turn_enabled: Boolean(TURN_SECRET),
        ws_clients: wss.clients ? wss.clients.size : 0,
        transfer_stats: {
          total_rooms_created: telemetry.totalRoomsCreated,
          total_bytes_relayed: telemetry.totalBytesRelayed,
          total_frames_relayed: telemetry.totalFramesRelayed,
          active_streams: telemetry.activeStreams,
        },
        services: {
          http_api: { ok: true, status: "operational", label: "Edge redirect & room registry" },
          ws_signaling: { ok: true, status: "operational", label: "Real-time WebRTC SDP & ICE broker" },
          turbo_relay: { ok: true, status: "operational", label: "Zero-copy TLS :443 binary stream relay" },
          turn_ice: {
            ok: true,
            status: TURN_SECRET ? "operational" : "stun-only",
            label: TURN_SECRET ? "NAT traversal & TURN-TCP relay" : "STUN direct traversal",
          },
          storage: { ok: true, status: "operational", label: "Atomic link store · zero-disk file policy" },
        },
      };
      return sendJson(res, req, 200, stats);
    }

    /* ── index ── */
    if (pathname === "/api/v1" && req.method === "GET") {
      return sendJson(res, req, 200, {
        name: "koza api",
        version: "v2.2",
        base_url: `${origin}/api/v1`,
        description:
          "Short links and hybrid P2P + Turbo binary file lines. Zero disk storage.",
        docs: `${origin}/docs`,
        endpoints: {
          shortener: {
            "POST /shorten": "create a short link — { url, slug?, password? }",
            "GET /links": "list links on this server",
            "GET /links/{slug}": "look up one link, clicks included",
            "POST /links/{slug}/hit": "count a click",
            "POST /links/{slug}/unlock": "trade a password for the destination url",
            "DELETE /links/{slug}": "burn a link (x-koza-key when admin key is set)",
          },
          box: {
            "POST /box/rooms":
              "open a direct line — { password?, files? } → { room, sender_token }",
            "GET /box/rooms/{code}": "inspect a line: staged files, lock state, fingerprint, expiry",
            "DELETE /box/rooms/{code}": "close the line early",
            "GET /turn": "short-lived turn credentials for the webrtc handshake",
            "WS /signal": "hybrid WebRTC signaling + binary WebSocket turbo relay",
            "POST|GET /signal/stream/{code}/{i}": "direct RAM cut-through HTTP stream",
          },
        },
      });
    }

    /* ── shortener ── */
    if (pathname === "/api/v1/shorten" && req.method === "POST") {
      if (!allowRate(req, "shorten", 60, 60_000)) {
        return sendJson(res, req, 429, { error: "rate limit exceeded — slow down" });
      }
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
        } while (db.links[slug] || RESERVED.has(slug));
      }

      const pw = typeof body.password === "string" ? body.password.trim() : "";
      if (pw && pw.length < 4) {
        return sendJson(res, req, 400, { error: "password too short — at least 4 characters" });
      }

      const salt = newSalt();
      const hashedPw = pw ? await hashPass(pw, salt) : null;
      const link = {
        slug,
        url: normalized,
        password: pw ? { kind: "scrypt", salt, hash: hashedPw } : null,
        clicks: 0,
        createdAt: Date.now(),
      };
      db.links[slug] = link;
      saveDb();
      return sendJson(res, req, 201, { link: publicLink(link, origin, true) });
    }

    if (pathname === "/api/v1/links" && req.method === "GET") {
      const links = Object.values(db.links)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100)
        .map((l) => publicLink(l, origin, false));
      return sendJson(res, req, 200, { count: links.length, links });
    }

    if ((m = pathname.match(/^\/api\/v1\/links\/([^/]+)$/))) {
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const link = db.links[slug];

      if (req.method === "GET") {
        if (!link) return sendJson(res, req, 404, { error: "no such link" });
        return sendJson(res, req, 200, { link: publicLink(link, origin, false) });
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
      if (!allowRate(req, "unlock", 20, 60_000)) {
        return sendJson(res, req, 429, { error: "too many password attempts — try again later" });
      }
      const slug = decodeURIComponent(m[1]).toLowerCase();
      const link = db.links[slug];
      if (!link) return sendJson(res, req, 404, { error: "no such link" });
      if (!link.password) return sendJson(res, req, 200, { url: link.url, unlocked: true });
      const body = await readJson(req);
      const pw = typeof body.password === "string" ? body.password : "";
      if (!(await verifyPass(link.password, pw))) {
        return sendJson(res, req, 403, { error: "wrong password" });
      }
      return sendJson(res, req, 200, { url: link.url, unlocked: true });
    }

    /* ── box rooms ── */
    if (pathname === "/api/v1/box/rooms" && req.method === "POST") {
      if (!allowRate(req, "rooms", 40, 60_000)) {
        return sendJson(res, req, 429, { error: "rate limit exceeded — slow down" });
      }
      pruneRooms();
      const body = await readJson(req);

      if (Array.isArray(body.files) && body.files.length > MAX_FILES_PER_ROOM) {
        return sendJson(res, req, 400, {
          error: `too many files — max ${MAX_FILES_PER_ROOM}`,
        });
      }

      const files = Array.isArray(body.files)
        ? body.files.slice(0, MAX_FILES_PER_ROOM).map((f) => ({
            name: String((f && f.name) || "file").trim().slice(0, 255) || "file",
            size: Math.max(0, Math.round(Number(f && f.size) || 0)),
          }))
        : [];

      let password = null;
      if (typeof body.password === "string" && body.password.trim()) {
        const pw = body.password.trim();
        if (pw.length < 4) {
          return sendJson(res, req, 400, { error: "password too short — at least 4 characters" });
        }
        const salt = newSalt();
        password = { kind: "scrypt", salt, hash: await hashPass(pw, salt) };
      } else if (typeof body.passwordHash === "string" && body.passwordHash) {
        password = { kind: "demo", salt: "", hash: body.passwordHash };
      }

      let code = "";
      do {
        code = randomFrom(CODE_ALPHABET, 6);
      } while (db.rooms[code]);

      const createdAt = Date.now();
      const room = {
        code,
        password,
        files,
        createdAt,
        fingerprint: computeRoomFingerprint(code, files, createdAt),
        senderToken: crypto.randomBytes(24).toString("hex"),
      };
      db.rooms[code] = room;
      telemetry.totalRoomsCreated += 1;
      saveDb();
      return sendJson(res, req, 201, {
        room: publicRoom(room, req),
        sender_token: room.senderToken,
      });
    }

    if (pathname === "/api/v1/box/rooms" && req.method === "GET") {
      pruneRooms();
      const rooms = Object.values(db.rooms)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => publicRoom(r, req));
      return sendJson(res, req, 200, { count: rooms.length, rooms });
    }

    /* support both /api/v1/box/rooms/:code and /api/v1/rooms/:code */
    if ((m = pathname.match(/^\/api\/v1\/(?:box\/)?rooms\/([^/]+)$/))) {
      const code = decodeURIComponent(m[1]).toUpperCase();
      const room = db.rooms[code];

      if (req.method === "GET") {
        pruneRooms();
        if (!room) return sendJson(res, req, 404, { error: "no such room (or it expired)" });
        return sendJson(res, req, 200, { room: publicRoom(room, req) });
      }

      if (req.method === "DELETE") {
        const ownToken = req.headers["x-koza-token"] || "";
        const own =
          room && ownToken && room.senderToken && safeEqual(room.senderToken, String(ownToken));
        if (!authorized(req) && !own) {
          return sendJson(res, req, 401, { error: "admin key or sender token required" });
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
        if (link.password) {
          return sendJson(res, req, 403, {
            error: "password required — unlock via POST /api/v1/links/:slug/unlock",
            slug,
            locked: true,
          });
        }
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

/* ── websocket signaling + binary turbo relay ───────────────────────── */
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 16 * 1024 * 1024, // 16 MiB binary chunks supported
  perMessageDeflate: false, // disable zlib compression overhead for raw binary speed
});

async function joinLine(ws, msg) {
  const code = String(msg.code || "").toUpperCase();
  const role = msg.role === "sender" ? "sender" : msg.role === "receiver" ? "receiver" : null;
  const isLane = msg.type === "join-lane" || Boolean(msg.lane);
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
  } else if (room.password && !(await verifyPass(room.password, String(msg.password ?? "")))) {
    return sendWs(ws, { type: "error", reason: "wrong-password" });
  }

  let line = lines.get(code);
  if (!line) {
    line = {
      sender: null,
      receiver: null,
      senderLanes: new Set(),
      receiverLanes: new Set(),
      bytesRelayed: 0,
    };
    lines.set(code, line);
  }

  if (isLane) {
    const laneSet = role === "sender" ? line.senderLanes : line.receiverLanes;
    if (laneSet.size >= MAX_LANES_PER_ROLE) {
      return sendWs(ws, { type: "error", reason: "too-many-lanes" });
    }
    laneSet.add(ws);
    ws.profile = { code, role, isLane: true };
    sendWs(ws, { type: "lane-joined", role, lanes: laneSet.size });
    if (role === "receiver" && line.sender && line.sender.readyState === 1) {
      sendWs(line.sender, { type: "lane-ready", lanes: laneSet.size });
    }
    return;
  }

  if (line[role] && line[role] !== ws) {
    try {
      clearWsPause(line[role]);
      line[role].profile = null;
      line[role].terminate();
    } catch {
      /* replacing a stale peer */
    }
    const staleLanes = role === "sender" ? line.senderLanes : line.receiverLanes;
    if (staleLanes) {
      for (const lws of staleLanes) {
        try {
          clearWsPause(lws);
          lws.profile = null;
          lws.terminate();
        } catch {}
      }
      staleLanes.clear();
    }
  }
  line[role] = ws;
  ws.profile = { code, role, isLane: false };

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
  clearWsPause(ws);
  const p = ws.profile;
  if (!p) return;
  ws.profile = null;
  const line = lines.get(p.code);
  if (!line) return;
  if (p.isLane) {
    line.senderLanes?.delete(ws);
    line.receiverLanes?.delete(ws);
    return;
  }
  if (line[p.role] === ws) line[p.role] = null;
  const other = p.role === "sender" ? line.receiver : line.sender;
  if (other && other.readyState === 1) sendWs(other, { type: "peer-left" });
  if (!line.sender && !line.receiver) {
    const hadBytes = (line.bytesRelayed || 0) > 0;
    for (const lws of [...(line.senderLanes || []), ...(line.receiverLanes || [])]) {
      try {
        clearWsPause(lws);
        lws.profile = null;
        lws.close();
      } catch {}
    }
    lines.delete(p.code);
    if (hadBytes) saveDb();
  }
}

wss.on("connection", (ws, req) => {
  ws.isAlive = true;
  ws.profile = null;
  ws._pauseTimer = null;
  ws._pauseTimeout = null;
  req?.socket?.setNoDelay?.(true);

  ws.on("pong", () => {
    ws.isAlive = true;
  });

  ws.on("message", (data, isBinary) => {
    ws.isAlive = true;

    /* ── Zero-Copy Multi-Lane Binary Turbo Relay ── */
    if (isBinary) {
      const p = ws.profile;
      if (!p) return;
      const line = lines.get(p.code);
      if (!line) return;

      /* Pick the least-buffered receiver lane (or fall back to primary socket) */
      const targetPool = p.role === "sender" ? line.receiverLanes : line.senderLanes;
      let peer = null;
      let minBuf = Infinity;
      if (targetPool && targetPool.size > 0) {
        for (const candidate of targetPool) {
          if (candidate.readyState === 1 && candidate.bufferedAmount < minBuf) {
            minBuf = candidate.bufferedAmount;
            peer = candidate;
          }
        }
      }
      if (!peer) {
        const primary = p.role === "sender" ? line.receiver : line.sender;
        if (primary && primary.readyState === 1) peer = primary;
      }

      if (peer && peer.readyState === 1) {
        const len = data.byteLength || data.length || 0;
        line.bytesRelayed = (line.bytesRelayed || 0) + len;
        telemetry.totalBytesRelayed += len;
        telemetry.totalFramesRelayed += 1;

        /* Socket-level backpressure guard with safe cleanup & max timeout */
        if (
          peer.bufferedAmount > 8 * 1024 * 1024 &&
          ws._socket &&
          !ws._socket.isPaused() &&
          !ws._pauseTimer
        ) {
          try {
            ws._socket.pause();
            ws._pauseTimer = setInterval(() => {
              if (
                ws.readyState !== 1 ||
                peer.readyState !== 1 ||
                peer.bufferedAmount < 3 * 1024 * 1024
              ) {
                clearWsPause(ws);
              }
            }, 12);
            ws._pauseTimeout = setTimeout(() => clearWsPause(ws), 2000);
          } catch {
            clearWsPause(ws);
          }
        }

        peer.send(data, { binary: true });
      }
      return;
    }

    /* ── JSON Signaling & Control Frames ── */
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (!ws.profile) {
      if (msg && (msg.type === "join" || msg.type === "join-lane")) {
        void joinLine(ws, msg);
      } else {
        sendWs(ws, { type: "error", reason: "join first" });
      }
      return;
    }

    if (msg && msg.type === "ping") {
      return sendWs(ws, { type: "pong", ts: msg.ts });
    }

    if (msg && typeof msg.type === "string" && msg.type !== "join" && msg.type !== "join-lane") {
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
    clearWsPause(ws);
    try {
      ws.terminate();
    } catch {}
    leaveLine(ws);
  });
});

/* keepalive ping */
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      clearWsPause(ws);
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    try {
      ws.ping();
    } catch {}
  }
}, 25_000).unref();

server.on("upgrade", (req, socket, head) => {
  const { pathname } = new URL(req.url, "http://localhost");
  if (pathname !== "/signal") return socket.destroy();
  socket.setNoDelay(true);
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
});

/* ── boot ───────────────────────────────────────────────────────────── */
loadDb();
server.listen(PORT, () => {
  console.log(`[koza v2.2] listening on :${PORT}  ·  data: ${DATA_FILE}`);
  if (!ADMIN_KEY) console.log("[koza] KOZA_ADMIN_KEY empty — DELETE endpoints are open");
});

process.on("SIGTERM", () => {
  saveDbSync();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
});
