/* koza signaling smoke test — run: node scripts/test-signal.js
   expects the server on :8787 (KOZA_SIGNAL overrides the ws url) */
const WebSocket = require("../server/node_modules/ws");

const HTTP = process.env.KOZA_HTTP || "http://localhost:8787";
const SIGNAL = process.env.KOZA_SIGNAL || "ws://localhost:8787/signal";
const PW = "1234";

let passed = 0;
let failed = 0;
function ok(name, cond) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✗ ${name}`);
  }
}

function wsOpen(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const inbox = [];
    const waiters = [];
    ws.on("message", (d) => {
      const msg = JSON.parse(d.toString());
      const i = waiters.findIndex((w) => w.match(msg));
      if (i >= 0) waiters.splice(i, 1)[0].resolve(msg);
      else inbox.push(msg);
    });
    ws.on("open", () => resolve({
      ws,
      recv: (match, ms = 3000) => {
        const i = inbox.findIndex(match);
        if (i >= 0) return Promise.resolve(inbox.splice(i, 1)[0]);
        return new Promise((res, rej) => {
          waiters.push({ match, resolve: res });
          setTimeout(() => rej(new Error("recv timeout")), ms);
        });
      },
    }));
    ws.on("error", reject);
  });
}

(async () => {
  /* 1. create a locked room over http */
  const res = await fetch(`${HTTP}/api/v1/box/rooms`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ password: PW, files: [{ name: "demo.bin", size: 1024 }] }),
  });
  const created = await res.json();
  const code = created.room && created.room.code;
  const token = created.sender_token;
  ok("room created over http", res.status === 201 && /^[A-Z0-9]{6}$/.test(code) && !!token);

  /* 2. sender joins with its token */
  const sender = await wsOpen(SIGNAL);
  sender.ws.send(JSON.stringify({ type: "join", code, role: "sender", token }));
  ok("sender joined (peers: 1)",
    (await sender.recv((m) => m.type === "joined")).peers === 1);

  /* 3. wrong token rejected */
  const impostor = await wsOpen(SIGNAL);
  impostor.ws.send(JSON.stringify({ type: "join", code, role: "sender", token: "nope" }));
  ok("impostor sender rejected",
    (await impostor.recv((m) => m.type === "error")).reason === "wrong-token");
  impostor.ws.close();

  /* 4. wrong room password rejected */
  const stranger = await wsOpen(SIGNAL);
  stranger.ws.send(JSON.stringify({ type: "join", code, role: "receiver", password: "0000" }));
  ok("wrong room password rejected",
    (await stranger.recv((m) => m.type === "error")).reason === "wrong-password");
  stranger.ws.close();

  /* 5. receiver joins with the right password → sender sees peer-joined */
  const receiver = await wsOpen(SIGNAL);
  receiver.ws.send(JSON.stringify({ type: "join", code, role: "receiver", password: PW }));
  const rJoined = await receiver.recv((m) => m.type === "joined");
  const sSawPeer = await sender.recv((m) => m.type === "peer-joined");
  ok("receiver joined (peers: 2)", rJoined.peers === 2);
  ok("sender got peer-joined", !!sSawPeer);

  /* 6. handshake relays both ways */
  sender.ws.send(JSON.stringify({ type: "offer", sdp: "fake-sdp-offer" }));
  const offer = await receiver.recv((m) => m.type === "offer");
  ok("offer relayed sender → receiver", offer.sdp === "fake-sdp-offer" && offer.from === "sender");

  receiver.ws.send(JSON.stringify({ type: "answer", sdp: "fake-sdp-answer" }));
  const answer = await sender.recv((m) => m.type === "answer");
  ok("answer relayed receiver → sender", answer.sdp === "fake-sdp-answer" && answer.from === "receiver");

  receiver.ws.send(JSON.stringify({ type: "ice", candidate: { sdpMid: "0" } }));
  const ice = await sender.recv((m) => m.type === "ice");
  ok("ice relayed", ice.candidate.sdpMid === "0");

  /* 7. receiver leaves → sender sees peer-left */
  receiver.ws.close();
  await sender.recv((m) => m.type === "peer-left");
  ok("sender got peer-left", true);

  /* 8. sender reconnects into its slot after a crash */
  sender.ws.close();
  const sender2 = await wsOpen(SIGNAL);
  sender2.ws.send(JSON.stringify({ type: "join", code, role: "sender", token }));
  ok("sender can rejoin its slot",
    (await sender2.recv((m) => m.type === "joined")).role === "sender");
  sender2.ws.close();

  /* 9. join a dead room */
  const ghost = await wsOpen(SIGNAL);
  ghost.ws.send(JSON.stringify({ type: "join", code: "ZZZZZZ", role: "receiver" }));
  ok("dead room → no-room",
    (await ghost.recv((m) => m.type === "error")).reason === "no-room");
  ghost.ws.close();

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
})().catch((err) => {
  console.error("test crashed:", err.message);
  process.exitCode = 1;
});
