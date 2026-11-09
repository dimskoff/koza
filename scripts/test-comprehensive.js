/* Comprehensive Backend & P2P Engine Verification Test */
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

function wsOpen(url) {
  return new Promise((resolve, reject) => {
    const ws = new WS(url);
    const inbox = [];
    const waiters = [];
    const onData = (d) => {
      const raw = typeof d === "object" && d !== null && "data" in d ? d.data : d;
      const msg = JSON.parse(raw.toString());
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    };
    const makeClient = () => ({
      ws,
      send: (obj) => ws.send(JSON.stringify(obj)),
      recv: (match, ms = 3000) => {
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
      ws.on("message", onData);
      ws.on("open", () => resolve(makeClient()));
      ws.on("error", reject);
    } else {
      ws.onmessage = onData;
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

  // Receiver joins FIRST
  const receiver1 = await wsOpen(SIGNAL);
  receiver1.send({ type: "join", code: code1, role: "receiver" });
  const rJoined = await receiver1.recv((m) => m.type === "joined");
  ok("Receiver joined alone (peers: 1)", rJoined.peers === 1);

  // Sender joins SECOND
  const sender1 = await wsOpen(SIGNAL);
  sender1.send({ type: "join", code: code1, role: "sender", token: token1 });
  const sJoined = await sender1.recv((m) => m.type === "joined");
  ok("Sender joined second and sees peers: 2", sJoined.peers === 2);

  // Sender gets peer-ready notification so it knows to create offer immediately!
  const sReady = await sender1.recv((m) => m.type === "peer-ready");
  ok("Sender got peer-ready signal immediately", !!sReady);

  // Receiver gets peer-joined notification
  const rSawPeer = await receiver1.recv((m) => m.type === "peer-joined");
  ok("Receiver got peer-joined signal", !!rSawPeer);

  // Custom signaling relay
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

  // Sender reconnects with a new socket (simulating page reload / socket recreation)
  const sender2B = await wsOpen(SIGNAL);
  sender2B.send({ type: "join", code: code2, role: "sender", token: token2 });
  const sRejoined = await sender2B.recv((m) => m.type === "joined");
  ok("Sender re-joined into its slot", sRejoined.role === "sender");

  // Verify receiver did NOT get an unwanted peer-left from sender2A's termination!
  let falseDrop = false;
  try {
    await receiver2.recv((m) => m.type === "peer-left", 300);
    falseDrop = true;
  } catch {
    // Timeout expected: no false peer-left emitted!
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

  // Delete the room with the sender token
  const delRes = await fetch(`${HTTP}/api/v1/box/rooms/${code3}`, {
    method: "DELETE",
    headers: { "x-koza-token": token3 },
  });
  ok("Room DELETE via sender token succeeded", delRes.status === 200);

  // Both peers should receive 'bye' (room-deleted)
  const sBye = await sender3.recv((m) => m.type === "bye");
  const rBye = await receiver3.recv((m) => m.type === "bye");
  ok("Sender received bye on room delete", sBye.reason === "room-deleted");
  ok("Receiver received bye on room delete", rBye.reason === "room-deleted");

  sender3.close();
  receiver3.close();

  console.log("\n── Test 4: Simulated Data Channel Transfer with Backpressure (64 MB payload) ──");
  // Test chunking, 1MB block reads, and buffer drain mechanics
  const TOTAL_SIZE = 64 * 1024 * 1024; // 64 MB
  const CHUNK_SIZE = 32 * 1024;
  const READ_BLOCK_SIZE = 1024 * 1024;
  const BUFFER_LOW = 128 * 1024;
  const BUFFER_HIGH = 512 * 1024;

  const sampleData = crypto.randomBytes(TOTAL_SIZE);
  const srcHash = crypto.createHash("sha256").update(sampleData).digest("hex");

  // Simulated RTCDataChannel with backpressure simulation
  class MockDataChannel {
    constructor(peer) {
      this.peer = peer;
      this.bufferedAmount = 0;
      this.bufferedAmountLowThreshold = BUFFER_LOW;
      this.readyState = "open";
      this.listeners = {};
    }
    addEventListener(name, fn) {
      (this.listeners[name] = this.listeners[name] || []).push(fn);
    }
    removeEventListener(name, fn) {
      if (!this.listeners[name]) return;
      this.listeners[name] = this.listeners[name].filter((f) => f !== fn);
    }
    emit(name, ...args) {
      for (const fn of this.listeners[name] || []) fn(...args);
    }
    send(data) {
      if (typeof data === "string") {
        setTimeout(() => this.peer.onMessage(data), 0);
        return;
      }
      this.bufferedAmount += data.byteLength;
      // Simulate network transmission: drain simulated buffer after 1ms
      setTimeout(() => {
        this.bufferedAmount = Math.max(0, this.bufferedAmount - data.byteLength);
        this.peer.onMessage(data);
        if (this.bufferedAmount <= this.bufferedAmountLowThreshold) {
          this.emit("bufferedamountlow");
        }
      }, 1);
    }
  }

  const dcReceiver = {
    receivedChunks: [],
    receivedBytes: 0,
    doneFiles: [],
    allDone: false,
    onMessage(data) {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.kind === "all-done") {
          this.allDone = true;
          this.dc.send(JSON.stringify({ kind: "all-done" }));
        }
        return;
      }
      this.receivedChunks.push(Buffer.from(data));
      this.receivedBytes += data.byteLength;
      if (this.receivedBytes >= TOTAL_SIZE) {
        this.doneFiles.push(0);
        this.dc.send(JSON.stringify({ kind: "done", i: 0, bytes: this.receivedBytes }));
      }
    },
  };

  const dcSender = {
    doneAck: false,
    allDoneAck: false,
    onMessage(data) {
      if (typeof data === "string") {
        const msg = JSON.parse(data);
        if (msg.kind === "done") this.doneAck = true;
        if (msg.kind === "all-done") this.allDoneAck = true;
      }
    },
  };

  const senderDc = new MockDataChannel(dcReceiver);
  const receiverDc = new MockDataChannel(dcSender);
  dcReceiver.dc = receiverDc;
  dcSender.dc = senderDc;

  function waitDrainMock(dc) {
    if (dc.bufferedAmount <= BUFFER_LOW) return Promise.resolve();
    return new Promise((resolve) => {
      const onLow = () => {
        dc.removeEventListener("bufferedamountlow", onLow);
        resolve();
      };
      dc.addEventListener("bufferedamountlow", onLow);
      const timer = setInterval(() => {
        if (dc.bufferedAmount <= BUFFER_LOW) {
          clearInterval(timer);
          dc.removeEventListener("bufferedamountlow", onLow);
          resolve();
        }
      }, 5);
    });
  }

  // Simulate sender pumping 64 MB
  const tStart = Date.now();
  senderDc.send(JSON.stringify({ kind: "start", i: 0, name: "large.bin", size: TOTAL_SIZE, type: "application/octet-stream" }));

  let offset = 0;
  while (offset < TOTAL_SIZE) {
    const blockEnd = Math.min(TOTAL_SIZE, offset + READ_BLOCK_SIZE);
    const blockBuf = sampleData.subarray(offset, blockEnd);

    let blockOffset = 0;
    while (blockOffset < blockBuf.byteLength) {
      if (senderDc.bufferedAmount >= BUFFER_HIGH) {
        await waitDrainMock(senderDc);
      }
      const sliceLen = Math.min(CHUNK_SIZE, blockBuf.byteLength - blockOffset);
      const chunk = blockBuf.subarray(blockOffset, blockOffset + sliceLen);
      senderDc.send(chunk);
      blockOffset += sliceLen;
    }
    offset = blockEnd;
  }

  while (senderDc.bufferedAmount > 0) {
    await waitDrainMock(senderDc);
    await new Promise((r) => setTimeout(r, 10));
  }
  senderDc.send(JSON.stringify({ kind: "all-done" }));

  // Wait for delivery
  for (let iter = 0; iter < 100 && (!dcSender.doneAck || !dcSender.allDoneAck); iter++) {
    await new Promise((r) => setTimeout(r, 20));
  }

  const duration = (Date.now() - tStart) / 1000;
  const assembled = Buffer.concat(dcReceiver.receivedChunks);
  const dstHash = crypto.createHash("sha256").update(assembled).digest("hex");

  ok("Transfer completed: received exact byte count (64 MB)", assembled.length === TOTAL_SIZE);
  ok("Data integrity verified bit-for-bit (sha256 match)", srcHash === dstHash);
  ok("Receiver received all-done frame", dcReceiver.allDone);
  ok("Sender received done ACK", dcSender.doneAck);
  ok("Sender received all-done ACK", dcSender.allDoneAck);
  console.log(`  Transfer simulation throughput: ${(TOTAL_SIZE / 1024 / 1024 / duration).toFixed(1)} MB/s`);

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`========================================`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error("Test execution failed:", err);
  process.exitCode = 1;
});
