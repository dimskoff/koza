/* Comprehensive Backend & P2P / Turbo-WSS Engine Verification Test */
const crypto = require("node:crypto");

const WS = typeof globalThis.WebSocket !== "undefined" ? globalThis.WebSocket : require("../server/node_modules/ws");
const HTTP = process.env.KOZA_HTTP || "http://localhost:8787";
const SIGNAL = process.env.KOZA_SIGNAL || "ws://localhost:8787/signal";

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${name}`);
  }
}

function wsOpen(url, onBinary) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    ws.binaryType = "arraybuffer";
    const inbox = [];
    const waiters = [];
    const onData = (d, isBin) => {
      const raw = typeof d === "object" && d !== null && "data" in d ? d.data : d;
      if (isBin === true || raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
        const buf = Buffer.isBuffer(raw)
          ? raw
          : raw instanceof ArrayBuffer
            ? Buffer.from(raw)
            : Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
        if (onBinary) onBinary(buf);
        return;
      }
      const msg = JSON.parse(raw.toString());
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    };
    const makeClient = () => ({
      ws,
      send: (obj) => ws.send(JSON.stringify(obj)),
      sendBinary: (buf) => ws.send(buf),
      recv: (match, ms = 5000) => {
        const i = inbox.findIndex(match);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          waiters.push({ match, resolve: res });
          setTimeout(() => rej(new Error("recv timeout")), ms);
        });
      },
      close: () => ws.close(),
    });

    if (ws.on) {
      ws.on("message", (data, isBinary) => onData(data, isBinary));
      ws.on("open", () => resolve(makeClient()));
      ws.on("error", reject);
    } else {
      ws.onmessage = (ev) => onData(ev.data, typeof ev.data !== "string");
      ws.onopen = () => resolve(makeClient());
      ws.onerror = reject;
    }
  });
}

(async () => {
  console.log("── Test 1: Receiver joins FIRST, then Sender joins ──");
  const r1 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "bigfile.iso", size: 266 * 1024 * 1024 }] }),
  });
  const data1 = await r1.json();
  const code1 = data1.room?.code;
  const token1 = data1.sender_token;
  ok("Room created with token", !!code1 && !!token1);

  const receiver1 = await wsOpen(SIGNAL);
  receiver1.send({ type: "join", code: code1, role: "receiver" });
  const rJoined = await receiver1.recv((m) => m.type === "joined");
  ok("Receiver joined alone (peers: 1)", rJoined.peers === 1);

  const sender1 = await wsOpen(SIGNAL);
  sender1.send({ type: "join", code: code1, role: "sender", token: token1 });
  const sJoined = await sender1.recv((m) => m.type === "joined");
  ok("Sender joined second and sees peers: 2", sJoined.peers === 2);

  const sReady = await sender1.recv((m) => m.type === "peer-ready");
  ok("Sender got peer-ready signal immediately", !!sReady);

  const rSawPeer = await receiver1.recv((m) => m.type === "peer-joined");
  ok("Receiver got peer-joined signal", !!rSawPeer);

  sender1.send({ type: "custom-negotiation", payload: "test-payload" });
  const rCustom = await receiver1.recv((m) => m.type === "custom-negotiation");
  ok("Arbitrary signaling message relayed properly", rCustom.payload === "test-payload");

  receiver1.close();
  sender1.close();

  console.log("\n── Test 2: Peer replacement does not emit false peer-left ──");
  const r2 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "doc.pdf", size: 1024 }] }),
  });
  const data2 = await r2.json();
  const code2 = data2.room.code;
  const token2 = data2.sender_token;

  const sender2A = await wsOpen(SIGNAL);
  sender2A.send({ type: "join", code: code2, role: "sender", token: token2 });
  await sender2A.recv((m) => m.type === "joined");

  const receiver2 = await wsOpen(SIGNAL);
  receiver2.send({ type: "join", code: code2, role: "receiver" });
  await receiver2.recv((m) => m.type === "joined");
  await sender2A.recv((m) => m.type === "peer-joined");

  const sender2B = await wsOpen(SIGNAL);
  sender2B.send({ type: "join", code: code2, role: "sender", token: token2 });
  const sRejoined = await sender2B.recv((m) => m.type === "joined");
  ok("Sender re-joined into its slot", sRejoined.role === "sender");

  let falseDrop = false;
  try {
    await receiver2.recv((m) => m.type === "peer-left", 300);
    falseDrop = true;
  } catch {
    falseDrop = false;
  }
  ok("No false peer-left sent to receiver on sender reconnect", !falseDrop);

  receiver2.close();
  sender2B.close();

  console.log("\n── Test 3: Line closure on room DELETE ──");
  const r3 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "test.zip", size: 500 }] }),
  });
  const data3 = await r3.json();
  const code3 = data3.room.code;
  const token3 = data3.sender_token;

  const sender3 = await wsOpen(SIGNAL);
  sender3.send({ type: "join", code: code3, role: "sender", token: token3 });
  await sender3.recv((m) => m.type === "joined");

  const receiver3 = await wsOpen(SIGNAL);
  receiver3.send({ type: "join", code: code3, role: "receiver" });
  await receiver3.recv((m) => m.type === "joined");

  const delRes = await fetch(`${HTTP}/api/v1/box/rooms/${code3}`, {
    method: "DELETE",
    headers: { "x-koza-token": token3 },
  });
  ok("Room DELETE via sender token succeeded", delRes.status === 200);

  const sBye = await sender3.recv((m) => m.type === "bye");
  const rBye = await receiver3.recv((m) => m.type === "bye");
  ok("Sender received bye on room delete", sBye.reason === "room-deleted");
  ok("Receiver received bye on room delete", rBye.reason === "room-deleted");

  sender3.close();
  receiver3.close();

  console.log("\n── Test 4: REAL Zero-Copy Binary WebSocket Turbo Relay (64 MB over /signal) ──");
  const TOTAL_SIZE = 64 * 1024 * 1024; // 64 MB
  const WS_CHUNK_SIZE = 256 * 1024;    // 256 KiB binary frames
  const sampleData = crypto.randomBytes(TOTAL_SIZE);
  const srcHash = crypto.createHash("sha256").update(sampleData).digest("hex");

  const r4 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "Beekeeper-Studio-Setup.exe", size: TOTAL_SIZE }] }),
  });
  const data4 = await r4.json();
  const code4 = data4.room.code;
  const token4 = data4.sender_token;

  const receivedChunks = [];
  let receivedBytes = 0;

  let sender4;
  const receiver4 = await wsOpen(SIGNAL, (buf) => {
    receivedChunks.push(buf);
    receivedBytes += buf.byteLength;
    if (receivedBytes >= TOTAL_SIZE) {
      receiver4.send({ type: "ctrl", frame: { kind: "done", i: 0, bytes: receivedBytes } });
    }
  });
  receiver4.send({ type: "join", code: code4, role: "receiver" });
  await receiver4.recv((m) => m.type === "joined");

  sender4 = await wsOpen(SIGNAL);
  sender4.send({ type: "join", code: code4, role: "sender", token: token4 });
  await sender4.recv((m) => m.type === "joined");
  await sender4.recv((m) => m.type === "peer-ready");
  await receiver4.recv((m) => m.type === "peer-joined");

  const tStart = performance.now();
  sender4.send({
    type: "ctrl",
    frame: { kind: "start", i: 0, name: "Beekeeper-Studio-Setup.exe", size: TOTAL_SIZE, type: "application/octet-stream" },
  });
  const startCtrl = await receiver4.recv((m) => m.type === "ctrl" && m.frame?.kind === "start");
  ok("Control frame relayed via turbo-wss", startCtrl.frame.size === TOTAL_SIZE);

  for (let offset = 0; offset < TOTAL_SIZE; offset += WS_CHUNK_SIZE) {
    const slice = sampleData.subarray(offset, Math.min(TOTAL_SIZE, offset + WS_CHUNK_SIZE));
    sender4.sendBinary(slice);
  }

  const doneCtrl = await sender4.recv((m) => m.type === "ctrl" && m.frame?.kind === "done", 15000);
  const elapsedSec = (performance.now() - tStart) / 1000;
  const mbps = TOTAL_SIZE / (1024 * 1024) / elapsedSec;

  const assembled = Buffer.concat(receivedChunks);
  const dstHash = crypto.createHash("sha256").update(assembled).digest("hex");

  ok("Turbo-WSS 64 MB binary transfer completed", doneCtrl.frame.bytes === TOTAL_SIZE && assembled.length === TOTAL_SIZE);
  ok("Turbo-WSS SHA-256 bit-for-bit integrity verified", srcHash === dstHash);
  console.log(`  ⚡ Real Turbo-WSS relay throughput: ${mbps.toFixed(1)} MB/s (${(elapsedSec * 1000).toFixed(0)} ms for 64 MB)`);

  sender4.close();
  receiver4.close();

  console.log("\n── Test 5: Direct HTTP Cut-Through Stream Pipe (/signal/stream/:code/:idx) ──");
  const r5 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "payload.bin", size: 1024 * 1024 }] }),
  });
  const data5 = await r5.json();
  const code5 = data5.room.code;
  const token5 = data5.sender_token;

  const http = require("node:http");
  const STREAM_SIZE = 1 * 1024 * 1024; // 1 MB
  const streamPayload = crypto.randomBytes(STREAM_SIZE);
  const streamSrcHash = crypto.createHash("sha256").update(streamPayload).digest("hex");

  const getChunks = [];
  const getPromise = new Promise((resolve, reject) => {
    const req = http.get(`${HTTP}/signal/stream/${code5}/0`, (res) => {
      res.on("data", (chunk) => getChunks.push(chunk));
      res.on("end", () => resolve(res.statusCode));
    });
    req.on("error", reject);
  });

  await new Promise((r) => setTimeout(r, 100));

  const postPromise = new Promise((resolve, reject) => {
    const req = http.request(
      `${HTTP}/signal/stream/${code5}/0`,
      {
        method: "POST",
        headers: {
          "x-koza-token": token5,
          "content-type": "application/octet-stream",
          "content-length": String(STREAM_SIZE),
        },
      },
      (res) => {
        const bodyChunks = [];
        res.on("data", (c) => bodyChunks.push(c));
        res.on("end", () => resolve(JSON.parse(Buffer.concat(bodyChunks).toString())));
      },
    );
    req.on("error", reject);
    req.write(streamPayload);
    req.end();
  });

  const [postJson, getStatusCode] = await Promise.all([postPromise, getPromise]);
  const assembledStream = Buffer.concat(getChunks);
  const streamDstHash = crypto.createHash("sha256").update(assembledStream).digest("hex");

  ok("HTTP cut-through stream POST & GET succeeded", postJson.ok === true && getStatusCode === 200);
  ok("HTTP cut-through stream SHA-256 integrity verified", streamSrcHash === streamDstHash);

  console.log("\n── Test 6: Telemetry /api/v1/stats ──");
  const statsRes = await fetch(`${HTTP}/api/v1/stats`);
  const statsData = await statsRes.json();
  ok("Stats v2.2 returns operational status & version", statsData.status === "operational" && typeof statsData.version === "string");
  ok("Stats v2.2 tracks total_bytes_relayed (>65 MB)", statsData.transfer_stats?.total_bytes_relayed >= TOTAL_SIZE + STREAM_SIZE);
  ok("Stats includes services health matrix", statsData.services?.ws_signaling?.ok === true && statsData.services?.storage?.ok === true);
  ok("Stats v2.2 returns redirects & rooms_count numbers", typeof statsData.redirects === "number" && typeof statsData.rooms_count === "number");
  ok("Stats v2.2 does not expose admin dumps", statsData.links === undefined && statsData.admin_rooms === undefined);

  console.log("\n── Test 6b: Security Fixes (Locked Link Masking, Direct 302 Block, Room Fingerprint) ──");
  const lockedCreate = await fetch(`${HTTP}/api/v1/shorten`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: "secret.example.com/vault", password: "supersecretpassword" }),
  });
  const lockedJson = await lockedCreate.json();
  const lockedSlug = lockedJson.link?.slug;
  ok("Shortener auto-prepends https:// and returns URL on creation", lockedJson.link?.url === "https://secret.example.com/vault" && lockedJson.link?.password === true);

  const lockedInspect = await fetch(`${HTTP}/api/v1/links/${lockedSlug}`);
  const inspectJson = await lockedInspect.json();
  ok("GET /api/v1/links/:slug masks url as null when password-protected", inspectJson.link?.url === null && inspectJson.link?.password === true);

  const directGet = await fetch(`${HTTP}/${lockedSlug}`, { redirect: "manual" });
  ok("Direct GET /:slug blocks 302 redirect on password-protected link (403)", directGet.status === 403);

  const wrongUnlock = await fetch(`${HTTP}/api/v1/links/${lockedSlug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "wrong" }),
  });
  ok("POST /unlock rejects wrong password with 403", wrongUnlock.status === 403);

  const rightUnlock = await fetch(`${HTTP}/api/v1/links/${lockedSlug}/unlock`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: "supersecretpassword" }),
  });
  const rightJson = await rightUnlock.json();
  ok("POST /unlock returns destination URL with right password", rightJson.url === "https://secret.example.com/vault");
  ok("Room creation includes cryptographic fingerprint & omits password_hash", typeof data1.room?.fingerprint === "string" && data1.room.fingerprint.length === 19 && data1.room.password_hash === undefined);

  console.log("\n── Test 7: 6x Parallel Turbo Lanes + 12-byte KOZA Header + Out-of-Order Reassembly ──");
  const r7 = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ files: [{ name: "Beekeeper-Studio-Setup-6.2.0.exe", size: 32 * 1024 * 1024 }] }),
  });
  const data7 = await r7.json();
  const code7 = data7.room.code;
  const token7 = data7.sender_token;
  const MULTI_SIZE = 32 * 1024 * 1024;
  const MULTI_CHUNK = 128 * 1024;
  const multiSrc = crypto.randomBytes(MULTI_SIZE);
  const multiSrcHash = crypto.createHash("sha256").update(multiSrc).digest("hex");

  const chunksMap = new Map();
  let multiRecvBytes = 0;
  let startFrameReceived = false;

  const onLaneBinary = (buf) => {
    const magic = buf.readUInt32LE(0);
    const fileIdx = buf.readUInt32LE(4);
    const seq = buf.readUInt32LE(8);
    if (magic === 0x4b4f5a41 && fileIdx === 0) {
      const payload = buf.subarray(12);
      chunksMap.set(seq, payload);
      multiRecvBytes += payload.byteLength;
      if (multiRecvBytes >= MULTI_SIZE) {
        recvPrimary.send({ type: "xfer", kind: "done", i: 0, bytes: multiRecvBytes });
      }
    }
  };

  const recvPrimary = await wsOpen(SIGNAL, onLaneBinary);
  recvPrimary.send({ type: "join", code: code7, role: "receiver" });
  await recvPrimary.recv((m) => m.type === "joined");

  const recvLanes = [];
  for (let i = 0; i < 6; i++) {
    const rl = await wsOpen(SIGNAL, onLaneBinary);
    rl.send({ type: "join-lane", code: code7, role: "receiver", lane: i + 1 });
    await rl.recv((m) => m.type === "lane-joined");
    recvLanes.push(rl);
  }

  const sendPrimary = await wsOpen(SIGNAL);
  sendPrimary.send({ type: "join", code: code7, role: "sender", token: token7 });
  await sendPrimary.recv((m) => m.type === "joined");
  await sendPrimary.recv((m) => m.type === "peer-ready");

  const sendLanes = [];
  for (let i = 0; i < 6; i++) {
    const sl = await wsOpen(SIGNAL);
    sl.send({ type: "join-lane", code: code7, role: "sender", token: token7, lane: i + 1 });
    await sl.recv((m) => m.type === "lane-joined");
    sendLanes.push(sl);
  }

  // Send start control frame on primary control socket
  sendPrimary.send({
    kind: "start",
    i: 0,
    name: "Beekeeper-Studio-Setup-6.2.0.exe",
    size: MULTI_SIZE,
    mimeType: "application/x-msdownload",
    transport: "turbo-wss",
    type: "xfer",
  });
  const startMsg = await recvPrimary.recv((m) => m.type === "xfer" && m.kind === "start");
  startFrameReceived = startMsg.mimeType === "application/x-msdownload" && startMsg.type === "xfer";
  ok("Start frame preserves type='xfer' and mimeType='application/x-msdownload'", startFrameReceived);

  // Stripe chunks across all 6 sender lanes
  let seq = 0;
  for (let off = 0; off < MULTI_SIZE; off += MULTI_CHUNK) {
    const slice = multiSrc.subarray(off, Math.min(MULTI_SIZE, off + MULTI_CHUNK));
    const frame = Buffer.allocUnsafe(12 + slice.byteLength);
    frame.writeUInt32LE(0x4b4f5a41, 0);
    frame.writeUInt32LE(0, 4);
    frame.writeUInt32LE(seq, 8);
    slice.copy(frame, 12);
    sendLanes[seq % sendLanes.length].sendBinary(frame);
    seq++;
  }

  const doneMsg = await sendPrimary.recv((m) => m.type === "xfer" && m.kind === "done", 10000);
  ok("6x Parallel lanes completed 32 MB transfer", doneMsg.bytes === MULTI_SIZE);

  const orderedParts = [];
  for (let s = 0; s < seq; s++) {
    orderedParts.push(chunksMap.get(s));
  }
  const multiDstHash = crypto.createHash("sha256").update(Buffer.concat(orderedParts)).digest("hex");
  ok("6x Parallel out-of-order reassembly SHA-256 verified bit-for-bit", multiSrcHash === multiDstHash);

  for (const l of [...recvLanes, ...sendLanes, recvPrimary, sendPrimary]) l.close();

  console.log("\n── Test 8: Hardening (admin-only lists, legacy hashes, abuse policy) ──");
  const ADMIN = process.env.KOZA_ADMIN_KEY || "";
  const linksAnon = await fetch(`${HTTP}/api/v1/links`);
  ok("GET /links without admin key → 401", linksAnon.status === 401);
  const roomsAnon = await fetch(`${HTTP}/api/v1/box/rooms`);
  ok("GET /box/rooms without admin key → 401", roomsAnon.status === 401);
  const wrongKey = await fetch(`${HTTP}/api/v1/links`, { headers: { "x-koza-key": "nope" } });
  ok("GET /links with wrong admin key → 401", wrongKey.status === 401);
  if (ADMIN) {
    const linksAdmin = await fetch(`${HTTP}/api/v1/links`, { headers: { "x-koza-key": ADMIN } });
    ok("GET /links with admin key → 200", linksAdmin.status === 200);
  }
  const legacy = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ passwordHash: "1a2b3c" }),
  });
  ok("Legacy client-side passwordHash rejected (400)", legacy.status === 400);
  const shorten = (url) =>
    fetch(`${HTTP}/api/v1/shorten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ url }),
    });
  ok("Private address destination rejected (422)", (await shorten("http://192.168.1.1/admin")).status === 422);
  ok("Embedded credentials rejected (422)", (await shorten("https://user:pass@example.com")).status === 422);
  ok("javascript: scheme rejected (400)", (await shorten("javascript:alert(1)")).status === 400);
  const evilCors = await fetch(`${HTTP}/api/v1/stats`, { headers: { origin: "https://evil.example" } });
  ok("Foreign Origin gets no CORS header", evilCors.headers.get("access-control-allow-origin") === null);
  const qsPw = await fetch(`${HTTP}/signal/stream/${code5}/0?password=x`, { method: "POST" });
  ok("Stream sender token in query string is ignored (401)", qsPw.status === 401 || qsPw.status === 404);

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
});
