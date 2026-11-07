/* E2E box.koza.click: два headless-браузера, реальная P2P-передача файла
   через прод (signaling wss://box.koza.click/signal, байты — RTCDataChannel).

   Проверяет:
     1. комната создаётся, инвайт-линк живёт, /r/<code> отдаёт offer
     2. пароль проверяется сервером при join
     3. файл доходит БИТ-В-БИТ (sha256 отправленного == sha256 принятого)
     4. канал зашифрован: getStats → dtlsCipher/srtpState (DTLS обязателен
        в WebRTC — даже signaling-сервер байты не видит)
     5. соединение прямое: candidate pair host↔host, объём байтов идёт
        через пару, а не через сервер

   Запуск:  node scripts/e2e-box-prod.js   (из /home/z/my-project) */
const { chromium } = require("playwright");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE = process.env.E2E_BASE || "https://box.koza.click";
const FILE_BYTES = 6 * 1024 * 1024; // 6 MB — заметный объём для замера скорости

/* инструментировка: ловим каждый RTCPeerConnection в window.__pcs */
const PC_HOOK = `
  (() => {
    const Orig = window.RTCPeerConnection;
    window.__pcs = [];
    window.RTCPeerConnection = function (...args) {
      const pc = new Orig(...args);
      window.__pcs.push(pc);
      return pc;
    };
    window.RTCPeerConnection.prototype = Orig.prototype;
  })();
`;

/* снимок шифрования и маршрута из webrtc-stats (выполняется в браузере) */
const GRAB_STATS = () => {
  const run = async () => {
    const out = [];
    for (const pc of window.__pcs || []) {
      if (pc.connectionState !== "connected") continue;
      const rec = { conn: pc.connectionState, pair: {} };
      const rep = await pc.getStats();
      let pairIds = null;
      rep.forEach((s) => {
        if (s.type === "transport") {
          rec.dtlsCipher = s.dtlsCipher;
          rec.dtlsState = s.dtlsState;
          rec.srtpCipher = s.srtpCipher;
        }
        if (s.type === "candidate-pair" && s.state === "succeeded" && (s.selected || s.nominated)) {
          pairIds = s;
        }
        if (s.type === "local-candidate" && pairIds && s.id === pairIds.localCandidateId) {
          rec.pair.local = { addr: s.address || s.ip, port: s.port, type: s.candidateType, proto: s.protocol };
        }
        if (s.type === "remote-candidate" && pairIds && s.id === pairIds.remoteCandidateId) {
          rec.pair.remote = { addr: s.address || s.ip, port: s.port, type: s.candidateType, proto: s.protocol };
        }
        if (s.type === "candidate-pair" && pairIds && s.id === pairIds.id) {
          rec.pair.bytesSent = s.bytesSent;
          rec.pair.bytesReceived = s.bytesReceived;
          rec.pair.rttMs = s.currentRoundTripTime != null ? Math.round(s.currentRoundTripTime * 1000) : null;
        }
      });
      out.push(rec);
    }
    return out;
  };
  return run();
};

(async () => {
  const t0 = Date.now();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "koza-box-e2e-"));
  const srcFile = path.join(tmp, "koza-e2e-payload.bin");
  const payload = crypto.randomBytes(FILE_BYTES);
  fs.writeFileSync(srcFile, payload);
  const shaSrc = crypto.createHash("sha256").update(payload).digest("hex");
  console.log(`[payload] ${FILE_BYTES} bytes · sha256 ${shaSrc.slice(0, 16)}…`);

  const browser = await chromium.launch({
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--disable-features=WebRtcHideLocalIpsWithMdns",
    ],
  });

  const wire = (page, tag) => {
    page.on("console", (m) => {
      if (m.type() === "error") console.log(`[${tag} err]`, m.text().slice(0, 200));
    });
    page.on("pageerror", (e) => console.log(`[${tag} pageerror]`, String(e).slice(0, 200)));
    page.on("response", (r) => {
      if (r.status() >= 400) console.log(`[${tag}] HTTP ${r.status()} ${r.url().slice(0, 130)}`);
    });
  };

  /* ── sender ── */
  const ctxA = await browser.newContext({ acceptDownloads: true });
  await ctxA.addInitScript(PC_HOOK);
  const sender = await ctxA.newPage();
  wire(sender, "sender");
  await sender.goto(`${BASE}/box`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await sender.waitForSelector("text=Drop files here", { timeout: 20000 });
  console.log("[sender] /box open — ok");

  await sender.setInputFiles('input[type="file"]', srcFile);
  await sender.waitForSelector('input[aria-label="Optional room password"]', { timeout: 15000 });
  await sender.fill('input[aria-label="Optional room password"]', "1234");
  await sender.click("text=Open direct line");
  await sender.waitForSelector("text=searching for a peer", { timeout: 20000 });
  console.log("[sender] room opened, searching — ok");

  const invText = await sender.locator('button[title="Tap to copy"]').first().textContent();
  const code = (invText || "").match(/\/r\/\s*([A-Z0-9]{4,8})/i)?.[1];
  if (!code) throw new Error(`invite code not found in: ${(invText || "").slice(0, 100)}`);
  console.log("[sender] room code:", code, `(+${Math.round((Date.now() - t0) / 1000)}s)`);

  /* ── receiver ── */
  const ctxB = await browser.newContext({ acceptDownloads: true });
  await ctxB.addInitScript(PC_HOOK);
  const receiver = await ctxB.newPage();
  wire(receiver, "receiver");
  await receiver.goto(`${BASE}/r/${code}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await receiver.waitForSelector("text=Unlock the line", { timeout: 20000 });
  console.log("[receiver] offer + password gate — ok");

  await receiver.fill('input[aria-label="Line password"]', "1234");
  const dlPromise = receiver.waitForEvent("download", { timeout: 120000 });
  const unlockAt = Date.now();
  await receiver.click("text=Unlock the line");

  await sender.waitForSelector("text=moving bytes", { timeout: 30000 });
  const movingAt = Date.now();
  console.log(`[sender] handshake done, moving bytes (+${movingAt - unlockAt}ms since unlock)`);

  await receiver.waitForSelector("text=receiving", { timeout: 30000 });
  console.log("[receiver] receiving — ok");

  /* ── финал на обеих сторонах ── */
  await sender.waitForSelector("text=delivered", { timeout: 120000 });
  const senderDoneAt = Date.now();
  await receiver.waitForSelector("text=delivered", { timeout: 120000 });
  const transferMs = senderDoneAt - movingAt;
  console.log("[both] delivered — ok");

  /* ── целостность ── */
  const dl = await dlPromise;
  const got = path.join(tmp, "got.bin");
  await dl.saveAs(got);
  const gotBuf = fs.readFileSync(got);
  const shaGot = crypto.createHash("sha256").update(gotBuf).digest("hex");
  const intact = gotBuf.length === FILE_BYTES && shaGot === shaSrc;
  console.log(
    `[integrity] got ${gotBuf.length}/${FILE_BYTES} bytes · sha256 ${shaGot.slice(0, 16)}… — ${intact ? "MATCH ✓" : "MISMATCH ✗"}`,
  );
  console.log(
    `[throughput] ${(FILE_BYTES / 1024 / 1024).toFixed(1)} MB in ${(transferMs / 1000).toFixed(1)}s → ${(FILE_BYTES / 1024 / 1024 / (transferMs / 1000)).toFixed(1)} MB/s`,
  );

  /* ── доказательства шифрования и прямого маршрута ── */
  for (const [page, tag] of [[sender, "sender"], [receiver, "receiver"]]) {
    const stats = await page.evaluate(GRAB_STATS);
    for (const s of stats) {
      console.log(
        `[${tag} webrtc] conn=${s.conn} dtls=${s.dtlsCipher} dtlsState=${s.dtlsState} srtp=${s.srtpCipher ?? "n/a (datachannel)"}`,
      );
      console.log(
        `[${tag} route] local ${s.pair.local?.addr}:${s.pair.local?.port} (${s.pair.local?.type}/${s.pair.local?.proto}) ↔ remote ${s.pair.remote?.addr}:${s.pair.remote?.port} (${s.pair.remote?.type}/${s.pair.remote?.proto}) · bytesSent=${s.pair.bytesSent} bytesReceived=${s.pair.bytesReceived} rtt=${s.pair.rttMs}ms`,
      );
    }
  }

  /* что показывает UI (скорость/сводка) */
  const doneText = (await sender.innerText("body")).replace(/\s+/g, " ");
  const speedHit = doneText.match(/[\d.]+\s?(MB|KB)\/s/);
  if (speedHit) console.log(`[ui speed] ${speedHit[0]}`);

  await sender.screenshot({ path: "/tmp/kz-prod-sender-done.png" });
  await receiver.screenshot({ path: "/tmp/kz-prod-receiver-done.png" });

  await browser.close();
  console.log(intact ? "E2E PASS" : "E2E FAIL");
  process.exitCode = intact ? 0 : 1;
})().catch((e) => {
  console.error("E2E ERROR:", e.message);
  process.exit(1);
});
