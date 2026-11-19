// SPDX-License-Identifier: MPL-2.0
/* ─────────────────────────────────────────────────────────────────────
   koza box — Hybrid Multi-Lane P2P + Parallel Turbo-WSS Transfer Engine (v2.2)

   Architecture v2.2:
   • Dedicated Control Channel: Primary WebSocket (`this.ws`) carries ONLY
     instant JSON signaling & control (`start`, `ack`, `done`, `all-done`),
     never blocked behind binary queues.
   • 6x Parallel Binary WebSocket Turbo Pool (`join-lane`): Opens 6 parallel
     TLS :443 WebSocket lanes and routes each chunk to the lane with the
     lowest `bufferedAmount`, multiplying TCP congestion window by 6x.
   • 12-Byte Self-Describing Binary Frame Header (`[KOZA_MAGIC, fileIdx, seq]`):
     Allows chunks to arrive out-of-order across 6 parallel WebSocket lanes
     AND WebRTC Direct UDP DataChannel simultaneously, even if a binary chunk
     arrives before the JSON `start` frame, reassembling bit-for-bit in order.
   • Non-Destructive Direct UDP Upgrade: Starts streaming via Turbo-WSS
     within ~200ms while WebRTC negotiates in parallel; upgrades to Direct UDP
     (`host`/`srflx`/`prflx`) if a direct path opens without re-triggering
     `sendFiles()`.
   ───────────────────────────────────────────────────────────────────── */

import { getSite } from "@/lib/site";

const STUN_FALLBACK: RTCIceServer[] = [
  {
    urls: [
      "stun:stun.cloudflare.com:3478",
      "stun:stun.l.google.com:19302",
      "stun:stun1.l.google.com:19302",
    ],
  },
];

let cachedIceServers: RTCIceServer[] | null = null;
let cachedAt = 0;

async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (cachedIceServers && Date.now() - cachedAt < 10 * 60 * 1000) {
    return cachedIceServers;
  }
  try {
    const r = await fetch("/api/v1/turn", { cache: "no-store" });
    if (r.ok) {
      const data = await r.json();
      if (data?.turn?.urls && data.turn.username && data.turn.credential) {
        cachedIceServers = [
          ...STUN_FALLBACK,
          {
            urls: data.turn.urls,
            username: data.turn.username,
            credential: data.turn.credential,
          },
        ];
        cachedAt = Date.now();
        return cachedIceServers;
      }
    }
  } catch {
    /* stun fallback */
  }
  return STUN_FALLBACK;
}

/* ── Tuning constants ── */
const HEADER_MAGIC = 0x4b4f5a41; // "KOZA"
const HEADER_BYTES = 12; // [magic: u32, fileIndex: u32, chunkSeq: u32]
const PARALLEL_LANES = 6; // 6 parallel WebSocket data lanes
/* One chunk size for every transport: chunk `seq` of a file always covers
   bytes [seq*CHUNK_SIZE, (seq+1)*CHUNK_SIZE), so a lost chunk can be re-read
   from the File and re-sent by sequence number alone. */
const CHUNK_SIZE = 64 * 1024;
const READ_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB File slice read batch
const DC_BUFFER_LOW = 512 * 1024;
const DC_BUFFER_HIGH = 2 * 1024 * 1024;
const LANE_BUFFER_HIGH = 2 * 1024 * 1024; // 2 MiB per individual WS lane
const TOTAL_WS_BUFFER_HIGH = 10 * 1024 * 1024; // 10 MiB across all 6 WS lanes
const MAX_IN_FLIGHT = 20 * 1024 * 1024; // 20 MiB end-to-end unacknowledged window
const ACK_STEP = 512 * 1024; // Receiver acks every 512 KiB (plus a periodic flush)
const ACK_FLUSH_MS = 250;
const BLOB_COMPACT_BYTES = 16 * 1024 * 1024; // Compact received chunks into Blob every 16 MiB
const NACK_IDLE_MS = 1200; // no new chunk for this long → ask for the gaps
const NACK_REPEAT_MS = 1500;
const NACK_MAX_SEQS = 256;
const STALL_TIMEOUT_MS = 30_000; // sender gives up if the receiver is silent this long

export const chunkCountOf = (size: number) => Math.ceil(size / CHUNK_SIZE);

export type TransportMode = "p2p-udp" | "turbo-wss" | "connecting";

/* Compute a deterministic transfer fingerprint (`XXXX·XXXX·XXXX·XXXX`)
   from room code and staged files so both peers can verify the session */
export function computeTransferFingerprint(
  code: string,
  files: { name: string; size: number }[],
): string {
  const payload = `${code.toUpperCase()}|${files.map((f) => `${f.name}:${f.size}`).join("|")}`;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  let h3 = 0x9e3779b9;
  let h4 = 0x85ebca6b;
  for (let i = 0; i < payload.length; i++) {
    const c = payload.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ ((c << 3) | (c >>> 5)), 0x85ebca6b) >>> 0;
    h3 = Math.imul(h3 ^ (c + i), 0xc2b2ae35) >>> 0;
    h4 = Math.imul(h4 ^ (c * 31), 0x27d4eb2f) >>> 0;
  }
  const hex = (
    (h1 >>> 16).toString(16).padStart(4, "0") +
    (h2 >>> 16).toString(16).padStart(4, "0") +
    (h3 >>> 16).toString(16).padStart(4, "0") +
    (h4 >>> 16).toString(16).padStart(4, "0")
  ).toUpperCase();
  return `${hex.slice(0, 4)}·${hex.slice(4, 8)}·${hex.slice(8, 12)}·${hex.slice(12, 16)}`;
}

/* Pack 12-byte header + payload into a single Uint8Array<ArrayBuffer> */
function packChunkFrame(
  fileIndex: number,
  chunkSeq: number,
  sourceBuf: ArrayBuffer,
  byteOffset: number,
  byteLength: number,
): Uint8Array<ArrayBuffer> {
  const ab = new ArrayBuffer(HEADER_BYTES + byteLength);
  const frame = new Uint8Array(ab);
  const view = new DataView(ab);
  view.setUint32(0, HEADER_MAGIC, true);
  view.setUint32(4, fileIndex, true);
  view.setUint32(8, chunkSeq, true);
  frame.set(new Uint8Array(sourceBuf, byteOffset, byteLength), HEADER_BYTES);
  return frame;
}

/* Resolve the signaling WebSocket URL */
export function signalUrl(): string {
  if (typeof window === "undefined") return "";
  const configured = getSite().signalUrl;
  if (configured) return configured;
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  /* local dev: Next.js can't proxy WebSockets, talk to the api port directly */
  if (host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1") {
    return `${proto}//${host}:8787/signal`;
  }
  return `${proto}//${window.location.host}/signal`;
}

function openSignal(
  url: string,
  onJson: (msg: Record<string, unknown>) => void,
  onBinary: (buf: ArrayBuffer) => void,
  onClose: () => void,
): WebSocket {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";

  const pingInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
      } catch {}
    }
  }, 15_000);

  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      try {
        onJson(JSON.parse(e.data));
      } catch {}
      return;
    }
    if (e.data instanceof ArrayBuffer) {
      onBinary(e.data);
      return;
    }
    if (typeof Blob !== "undefined" && e.data instanceof Blob) {
      void e.data.arrayBuffer().then(onBinary);
    }
  };

  const cleanup = () => {
    clearInterval(pingInterval);
    onClose();
  };
  ws.onerror = cleanup;
  ws.onclose = cleanup;
  return ws;
}

/* Inspect RTCPeerConnection stats to determine if the active candidate pair
   is a true Direct UDP path (host / srflx / prflx) vs a slow TURN relay */
async function isDirectUdpConnection(pc: RTCPeerConnection): Promise<boolean> {
  try {
    const stats = await pc.getStats();
    let activePair: Record<string, unknown> | null = null;
    stats.forEach((report) => {
      if (report.type === "transport" && report.selectedCandidatePairId) {
        const pair = stats.get(report.selectedCandidatePairId);
        if (pair) activePair = pair;
      }
    });
    if (!activePair) {
      stats.forEach((report) => {
        if (report.type === "candidate-pair" && report.selected && report.state === "succeeded") {
          activePair = report;
        }
      });
    }
    if (!activePair) return false;
    const local = stats.get(String((activePair as Record<string, unknown>).localCandidateId ?? ""));
    const remote = stats.get(String((activePair as Record<string, unknown>).remoteCandidateId ?? ""));
    if (!local || !remote) return false;

    if (local.candidateType === "relay" || remote.candidateType === "relay") {
      return false;
    }
    const proto = String(local.protocol || remote.protocol || "udp").toLowerCase();
    return proto === "udp";
  } catch {
    return false;
  }
}

/* ── sender ────────────────────────────────────────────────────────── */

export interface SenderEvents {
  onJoined(): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onChannelOpen(mode: TransportMode): void;
  onTransportChange?(mode: TransportMode): void;
  onProgress(queuedBytes: number): void;
  onFileQueued(index: number): void;
  onFileDone(index: number): void;
  onAllDone(): void;
  onError(reason: string): void;
}

export class BoxSender {
  private ws: WebSocket | null = null;
  private lanes: WebSocket[] = [];
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private code = "";
  private token = "";
  private disposed = false;
  private queued = 0;
  private ackedBytes = 0;
  private candidateQueue: RTCIceCandidateInit[] = [];
  private makingOffer = false;
  private channelOpened = false;
  private sendingInProgress = false;
  private mode: TransportMode = "connecting";
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private ackWaiters: Array<() => void> = [];
  private doneFiles = new Set<number>();
  private fileDoneWaiters = new Map<number, () => void>();
  private rrIdx = 0;
  private files: File[] = [];
  private lastPeerActivity = 0;
  private resendChain: Promise<void> = Promise.resolve();

  constructor(private ev: SenderEvents) {}

  get transportMode(): TransportMode {
    return this.mode;
  }

  async connect(code: string, token: string): Promise<void> {
    this.code = code;
    this.token = token;
    void fetchIceServers();
    const url = signalUrl();

    this.ws = openSignal(
      url,
      (msg) => void this.onSignal(msg),
      () => {},
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({ type: "join", code: this.code, role: "sender", token: this.token }),
      );
      this.openTurboLanes(url);
    };
  }

  private openTurboLanes(url: string): void {
    this.closeLanes();
    for (let i = 0; i < PARALLEL_LANES; i++) {
      if (this.disposed) return;
      try {
        const lws = new WebSocket(url);
        lws.binaryType = "arraybuffer";
        lws.onopen = () => {
          if (this.disposed) {
            lws.close();
            return;
          }
          lws.send(
            JSON.stringify({
              type: "join-lane",
              code: this.code,
              role: "sender",
              token: this.token,
              lane: i + 1,
            }),
          );
        };
        lws.onerror = () => {};
        this.lanes.push(lws);
      } catch {}
    }
  }

  private closeLanes(): void {
    for (const lws of this.lanes) {
      try {
        lws.close();
      } catch {}
    }
    this.lanes = [];
  }

  private async onSignal(msg: Record<string, unknown>): Promise<void> {
    if (this.disposed) return;
    const type = msg.type as string;

    if (type === "error") {
      this.ev.onError(String(msg.reason ?? "signal error"));
      return;
    }

    if (type === "joined") {
      this.ev.onJoined();
      if (Number(msg.peers) >= 2) {
        this.ev.onPeerJoined();
        await this.startNegotiation();
      }
      return;
    }

    if (type === "peer-joined" || type === "peer-ready") {
      this.ev.onPeerJoined();
      await this.startNegotiation();
      return;
    }

    if (type === "lane-ready") {
      /* Receiver's parallel turbo lanes are open — start transferring immediately! */
      if (!this.channelOpened && !this.disposed) {
        this.activateTransport("turbo-wss");
      }
      return;
    }

    if (type === "peer-left" || type === "bye") {
      this.ev.onPeerLeft();
      this.teardownPc();
      return;
    }

    if (type === "xfer" || type === "ctrl" || typeof msg.kind === "string") {
      const payload =
        type === "ctrl" && msg.frame && typeof msg.frame === "object"
          ? (msg.frame as Record<string, unknown>)
          : msg;
      this.handleReceiverAck(payload);
      return;
    }

    if (type === "answer") {
      try {
        if (!this.pc) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: String(msg.sdp ?? "") });
        await this.flushCandidates();
      } catch {}
      return;
    }

    if (type === "ice" && msg.candidate) {
      const cand = msg.candidate as RTCIceCandidateInit;
      if (this.pc && this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(cand);
        } catch {}
      } else {
        this.candidateQueue.push(cand);
      }
      return;
    }
  }

  private async flushCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    const queued = this.candidateQueue.splice(0, this.candidateQueue.length);
    for (const cand of queued) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch {}
    }
  }

  /* The sender is the single source of truth for the transport mode: every
     change is announced to the receiver so both sides always show the same. */
  private setMode(mode: TransportMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.ev.onTransportChange?.(mode);
    try {
      this.sendControl({ kind: "mode", mode });
    } catch {
      /* control line gone — the transfer will error out on its own */
    }
  }

  private activateTransport(chosen: TransportMode): void {
    if (this.disposed) return;
    if (this.channelOpened) {
      /* Already streaming on turbo-wss and Direct UDP opens: upgrade WITHOUT calling
         `onChannelOpen` again (that would start a duplicate `sendFiles()`). */
      if (chosen === "p2p-udp" && this.mode === "turbo-wss") this.setMode("p2p-udp");
      return;
    }
    this.channelOpened = true;
    this.mode = chosen;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    try {
      this.sendControl({ kind: "mode", mode: chosen });
    } catch {}
    this.ev.onChannelOpen(chosen);
  }

  private async startNegotiation(): Promise<void> {
    if (this.makingOffer || this.disposed) return;
    this.makingOffer = true;

    /* Start streaming via Parallel Turbo-WSS after 250ms if Direct UDP hasn't opened yet,
       while allowing WebRTC to continue negotiating in the background for a Direct UDP upgrade! */
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => {
      if (!this.channelOpened && !this.disposed && this.ws?.readyState === WebSocket.OPEN) {
        this.activateTransport("turbo-wss");
      }
    }, 250);

    try {
      this.teardownPc();
      this.candidateQueue = [];

      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;

      const dc = pc.createDataChannel("koza", { ordered: true });
      dc.binaryType = "arraybuffer";
      dc.bufferedAmountLowThreshold = DC_BUFFER_LOW;
      this.dc = dc;

      dc.onopen = async () => {
        if (this.disposed) return;
        const directUdp = await isDirectUdpConnection(pc);
        if (directUdp) {
          this.activateTransport("p2p-udp");
        } else {
          /* Selected route is a TURN relay! Close TURN PC so it doesn't waste bandwidth,
             and ensure Parallel Turbo-WSS is active. */
          this.teardownPc();
          this.activateTransport("turbo-wss");
        }
      };

      dc.onmessage = (m) => {
        try {
          this.handleReceiverAck(JSON.parse(String(m.data)));
        } catch {}
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          this.relay({ type: "ice", candidate: e.candidate.toJSON() });
        }
      };

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        if (st !== "failed" && st !== "disconnected" && st !== "closed") return;
        /* "disconnected" is often transient: stop using the channel but keep the
           pc alive; only a hard failure tears it down. Chunks stuck in the
           channel buffer are recovered by the receiver's resend requests. */
        if (st !== "disconnected") this.teardownPc();
        if (!this.channelOpened && this.ws?.readyState === WebSocket.OPEN) {
          this.activateTransport("turbo-wss");
        } else if (this.mode === "p2p-udp") {
          this.setMode("turbo-wss");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.relay({ type: "offer", sdp: pc.localDescription?.sdp });
    } catch {
      if (!this.channelOpened && this.ws?.readyState === WebSocket.OPEN) {
        this.activateTransport("turbo-wss");
      }
    } finally {
      this.makingOffer = false;
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, from: "sender" }));
    }
  }

  /* Send JSON control message over the uncongested primary control WebSocket
     (and over DataChannel if in p2p-udp mode). Note `type: "xfer"` is placed LAST
     so `payload` can never overwrite it! */
  private sendControl(payload: Record<string, unknown>): void {
    const wire = JSON.stringify({ ...payload, type: "xfer" });
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(wire);
    } else if (this.dc?.readyState === "open") {
      this.dc.send(wire);
    } else {
      throw new Error("transport channel closed");
    }
  }

  /* Pick the parallel WebSocket lane with the lowest bufferedAmount */
  private pickBestWsLane(): WebSocket | null {
    let best: WebSocket | null = null;
    let minBuf = Infinity;
    const n = this.lanes.length;
    for (let k = 0; k < n; k++) {
      const idx = (this.rrIdx + k) % n;
      const cand = this.lanes[idx];
      if (cand && cand.readyState === WebSocket.OPEN && cand.bufferedAmount < minBuf) {
        minBuf = cand.bufferedAmount;
        best = cand;
        if (minBuf === 0) {
          this.rrIdx = (idx + 1) % n;
          break;
        }
      }
    }
    if (best) return best;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return this.ws;
    return null;
  }

  private totalWsBuffered(): number {
    let sum = this.ws?.readyState === WebSocket.OPEN ? this.ws.bufferedAmount : 0;
    for (const l of this.lanes) {
      if (l.readyState === WebSocket.OPEN) sum += l.bufferedAmount;
    }
    return sum;
  }

  /* `preferWs`: resends go over the WebSocket relay — it's ordered and
     reliable end-to-end, so a re-sent chunk can't be lost a second time. */
  private sendBinaryChunk(chunk: Uint8Array<ArrayBuffer>, preferWs = false): void {
    if (
      !preferWs &&
      this.mode === "p2p-udp" &&
      this.dc?.readyState === "open" &&
      this.dc.bufferedAmount < DC_BUFFER_HIGH
    ) {
      try {
        this.dc.send(chunk);
        return;
      } catch {
        this.setMode("turbo-wss");
      }
    }
    const lane = this.pickBestWsLane();
    if (lane) {
      lane.send(chunk);
    } else if (this.dc?.readyState === "open") {
      this.dc.send(chunk);
    } else {
      throw new Error("transport channel closed mid-flight");
    }
  }

  /* Progress = bytes the receiver has CONFIRMED, never bytes merely handed to
     a socket — so the sender can't show 100% while the receiver is behind. */
  private reportCurrentProgress(): void {
    this.ev.onProgress(this.ackedBytes);
  }

  private assertPeerAlive(): void {
    if (Date.now() - this.lastPeerActivity > STALL_TIMEOUT_MS) {
      throw new Error("the receiver stopped responding");
    }
  }

  private async waitBackpressure(ignoreWindow = false): Promise<void> {
    while (!this.disposed) {
      const inFlight = this.queued - this.ackedBytes;
      const windowOk = ignoreWindow || inFlight < MAX_IN_FLIGHT;

      if (this.mode === "p2p-udp" && this.dc?.readyState === "open") {
        if (this.dc.bufferedAmount < DC_BUFFER_HIGH && windowOk) return;
      } else {
        const bestLane = this.pickBestWsLane();
        if (!bestLane) throw new Error("signal connection closed");
        if (
          bestLane.bufferedAmount < LANE_BUFFER_HIGH &&
          this.totalWsBuffered() < TOTAL_WS_BUFFER_HIGH &&
          windowOk
        ) {
          return;
        }
      }
      this.assertPeerAlive();

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 16);
        this.ackWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  }

  private teardownPc(): void {
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.dc = null;
    this.pc = null;
  }

  private async readChunk(file: File, seq: number): Promise<ArrayBuffer> {
    const start = seq * CHUNK_SIZE;
    return file.slice(start, Math.min(file.size, start + CHUNK_SIZE)).arrayBuffer();
  }

  /* Re-send chunks the receiver reported missing. Serialized so concurrent
     requests never interleave; duplicates are harmless (receiver dedupes). */
  private queueResend(fileIndex: number, seqs: number[]): void {
    const file = this.files[fileIndex];
    if (!file || seqs.length === 0) return;
    const total = chunkCountOf(file.size);
    const wanted = [...new Set(seqs)]
      .filter((s) => Number.isInteger(s) && s >= 0 && s < total)
      .slice(0, NACK_MAX_SEQS);
    this.resendChain = this.resendChain
      .then(async () => {
        for (const seq of wanted) {
          if (this.disposed) return;
          await this.waitBackpressure(true);
          const buf = await this.readChunk(file, seq);
          this.sendBinaryChunk(packChunkFrame(fileIndex, seq, buf, 0, buf.byteLength), true);
        }
      })
      .catch(() => {
        /* the main loop surfaces fatal transport errors */
      });
  }

  /* Stream all staged files across 6x Parallel Turbo-WSS lanes + Direct UDP */
  async sendFiles(files: File[]): Promise<void> {
    if (this.sendingInProgress) return;
    this.sendingInProgress = true;
    this.files = files;
    this.queued = 0;
    this.ackedBytes = 0;
    this.doneFiles.clear();
    this.lastPeerActivity = Date.now();

    try {
      for (let i = 0; i < files.length; i++) {
        if (this.disposed) throw new Error("transfer cancelled");
        const file = files[i];
        const totalChunks = chunkCountOf(file.size);

        this.sendControl({
          kind: "start",
          i,
          name: file.name,
          size: file.size,
          chunks: totalChunks,
          mimeType: file.type || "application/octet-stream",
          transport: this.mode,
        });
        this.ev.onFileQueued(i);

        let offset = 0;
        let chunkSeq = 0;
        while (offset < file.size) {
          if (this.disposed) throw new Error("transfer cancelled");
          const blockEnd = Math.min(file.size, offset + READ_BLOCK_SIZE);
          const blockBuf = await file.slice(offset, blockEnd).arrayBuffer();

          let blockOffset = 0;
          while (blockOffset < blockBuf.byteLength) {
            if (this.disposed) throw new Error("transfer cancelled");
            await this.waitBackpressure();
            const sliceLen = Math.min(CHUNK_SIZE, blockBuf.byteLength - blockOffset);
            this.sendBinaryChunk(packChunkFrame(i, chunkSeq++, blockBuf, blockOffset, sliceLen));
            blockOffset += sliceLen;
            this.queued += sliceLen;
          }
          offset = blockEnd;
        }

        /* tell the receiver how many chunks to expect so it can ask for gaps */
        this.sendControl({ kind: "end", i, chunks: totalChunks });

        /* Wait for the receiver to confirm the file is complete. No fake
           "done" on timeout — if the receiver goes silent, the transfer fails
           loudly instead of reporting a delivery that never happened. */
        while (!this.doneFiles.has(i)) {
          if (this.disposed) throw new Error("transfer cancelled");
          this.assertPeerAlive();
          await new Promise<void>((resolve) => {
            const timer = setTimeout(resolve, 250);
            this.fileDoneWaiters.set(i, () => {
              clearTimeout(timer);
              resolve();
            });
          });
        }
        this.fileDoneWaiters.delete(i);
      }

      if (!this.disposed) this.sendControl({ kind: "all-done" });
    } finally {
      this.sendingInProgress = false;
    }
  }

  handleReceiverAck(msg: Record<string, unknown>): void {
    this.lastPeerActivity = Date.now();
    const kind = msg.kind as string;
    if (typeof msg.bytes === "number" && msg.bytes > this.ackedBytes) {
      this.ackedBytes = msg.bytes;
      this.reportCurrentProgress();
      const waiters = this.ackWaiters.splice(0, this.ackWaiters.length);
      for (const w of waiters) w();
    }
    if (kind === "resend") {
      const seqs = Array.isArray(msg.seqs) ? (msg.seqs as unknown[]).map(Number) : [];
      this.queueResend(Number(msg.i ?? -1), seqs);
    } else if (kind === "done") {
      const idx = Number(msg.i ?? 0);
      if (!this.doneFiles.has(idx)) {
        this.doneFiles.add(idx);
        this.ev.onFileDone(idx);
      }
      const fw = this.fileDoneWaiters.get(idx);
      if (fw) {
        this.fileDoneWaiters.delete(idx);
        fw();
      }
      const waiters = this.ackWaiters.splice(0, this.ackWaiters.length);
      for (const w of waiters) w();
    } else if (kind === "all-done") {
      this.ev.onAllDone();
    }
  }

  dispose(): void {
    this.disposed = true;
    this.sendingInProgress = false;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    const waiters = this.ackWaiters.splice(0, this.ackWaiters.length);
    for (const w of waiters) w();
    for (const fw of this.fileDoneWaiters.values()) fw();
    this.fileDoneWaiters.clear();
    this.teardownPc();
    this.closeLanes();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}

/* ── receiver ──────────────────────────────────────────────────────── */

export interface IncomingFile {
  name: string;
  size: number;
  type: string;
  metaReady: boolean;
  /** total chunks, known from `start` (or `end`) */
  expected: number;
  endSeen: boolean;
  blobParts: Blob[];
  orderedChunks: ArrayBuffer[];
  orderedBytes: number;
  /** out-of-order chunks waiting for the gap before them */
  chunksMap: Map<number, ArrayBuffer>;
  nextSeq: number;
  maxSeq: number;
  /** unique payload bytes (duplicates are never counted) */
  received: number;
  lastChunkAt: number;
  lastNackAt: number;
  finalized: boolean;
}

export interface ReceiverEvents {
  onJoined(): void;
  onPeerLeft(): void;
  /** the sender's transport mode — both sides always show the same one */
  onChannelOpen(mode?: TransportMode): void;
  onFileStart(index: number, meta: { name: string; size: number; type: string }): void;
  onProgress(index: number, bytes: number): void;
  onFileDone(index: number, file: { name: string; size: number; type: string; blob: Blob }): void;
  onAllDone(): void;
  onError(reason: string): void;
}

export class BoxReceiver {
  private ws: WebSocket | null = null;
  private lanes: WebSocket[] = [];
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private code = "";
  private password = "";
  private disposed = false;
  private incoming = new Map<number, IncomingFile>();
  private finalizedFiles = new Set<number>();
  private totalReceived = 0;
  private lastTotalAcked = 0;
  private lastAckAt = 0;
  private candidateQueue: RTCIceCandidateInit[] = [];
  private mode: TransportMode = "connecting";
  private watchdog: ReturnType<typeof setInterval> | null = null;

  constructor(private ev: ReceiverEvents) {}

  get transportMode(): TransportMode {
    return this.mode;
  }

  async connect(code: string, password?: string): Promise<void> {
    this.code = code;
    this.password = password ?? "";
    void fetchIceServers();
    const url = signalUrl();

    this.ws = openSignal(
      url,
      (msg) => void this.onSignal(msg),
      (buf) => this.onBinaryChunk(buf),
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({
          type: "join",
          code: this.code,
          role: "receiver",
          password: this.password,
        }),
      );
      this.openTurboLanes(url);
    };
    this.watchdog = setInterval(() => this.tick(), 300);
  }

  private openTurboLanes(url: string): void {
    this.closeLanes();
    for (let i = 0; i < PARALLEL_LANES; i++) {
      if (this.disposed) return;
      try {
        const lws = new WebSocket(url);
        lws.binaryType = "arraybuffer";
        lws.onopen = () => {
          if (this.disposed) {
            lws.close();
            return;
          }
          lws.send(
            JSON.stringify({
              type: "join-lane",
              code: this.code,
              role: "receiver",
              password: this.password,
              lane: i + 1,
            }),
          );
        };
        lws.onmessage = (e) => {
          if (e.data instanceof ArrayBuffer) {
            this.onBinaryChunk(e.data);
          } else if (typeof Blob !== "undefined" && e.data instanceof Blob) {
            void e.data.arrayBuffer().then((b) => this.onBinaryChunk(b));
          }
        };
        lws.onerror = () => {};
        this.lanes.push(lws);
      } catch {}
    }
  }

  private closeLanes(): void {
    for (const lws of this.lanes) {
      try {
        lws.close();
      } catch {}
    }
    this.lanes = [];
  }

  private getOrCreateEntry(index: number): IncomingFile {
    let entry = this.incoming.get(index);
    if (!entry) {
      entry = {
        name: `file-${index}`,
        size: 0,
        type: "application/octet-stream",
        metaReady: false,
        expected: -1,
        endSeen: false,
        blobParts: [],
        orderedChunks: [],
        orderedBytes: 0,
        chunksMap: new Map(),
        nextSeq: 0,
        maxSeq: -1,
        received: 0,
        lastChunkAt: Date.now(),
        lastNackAt: 0,
        finalized: false,
      };
      this.incoming.set(index, entry);
    }
    return entry;
  }

  private async onSignal(msg: Record<string, unknown>): Promise<void> {
    if (this.disposed) return;
    const type = msg.type as string;

    if (type === "error") {
      this.ev.onError(String(msg.reason ?? "signal error"));
      return;
    }

    if (type === "joined") {
      this.ev.onJoined();
      return;
    }

    if (type === "peer-left" || type === "bye") {
      this.ev.onPeerLeft();
      return;
    }

    /* Accept `xfer`, `ctrl`, OR any frame carrying `kind` (prevents any MIME `type` collision!) */
    if (type === "xfer" || type === "ctrl" || typeof msg.kind === "string") {
      const payload =
        type === "ctrl" && msg.frame && typeof msg.frame === "object"
          ? (msg.frame as Record<string, unknown>)
          : msg;
      this.onControlFrame(payload);
      return;
    }

    if (type === "offer") {
      await this.answerOffer(String(msg.sdp ?? ""));
      return;
    }

    if (type === "ice" && msg.candidate) {
      const cand = msg.candidate as RTCIceCandidateInit;
      if (this.pc && this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(cand);
        } catch {}
      } else {
        this.candidateQueue.push(cand);
      }
    }
  }

  private async flushCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    const queued = this.candidateQueue.splice(0, this.candidateQueue.length);
    for (const cand of queued) {
      try {
        await this.pc.addIceCandidate(cand);
      } catch {}
    }
  }

  private async answerOffer(sdp: string): Promise<void> {
    try {
      this.teardownPc();
      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;

      pc.ondatachannel = (e) => {
        const dc = e.channel;
        dc.binaryType = "arraybuffer";
        this.dc = dc;
        /* NOTE: the channel opening does not decide the mode — the sender may
           still reject it (e.g. it routes via TURN) and announces the real
           mode with a `mode` control frame. */
        dc.onmessage = (m) => {
          if (typeof m.data === "string") {
            try {
              this.onControlFrame(JSON.parse(m.data));
            } catch {}
          } else if (m.data instanceof ArrayBuffer) {
            this.onBinaryChunk(m.data);
          } else if (typeof Blob !== "undefined" && m.data instanceof Blob) {
            void m.data.arrayBuffer().then((b) => this.onBinaryChunk(b));
          }
        };
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) this.relay({ type: "ice", candidate: e.candidate.toJSON() });
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      await this.flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.relay({ type: "answer", sdp: pc.localDescription?.sdp });
    } catch {
      /* Parallel Turbo-WSS handles transfer if WebRTC fails */
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, from: "receiver" }));
    }
  }

  private sendAck(payload: Record<string, unknown>): void {
    const wire = JSON.stringify({ ...payload, type: "xfer" });
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(wire);
        return;
      } catch {}
    }
    if (this.dc?.readyState === "open") {
      try {
        this.dc.send(wire);
      } catch {}
    }
  }

  private flushAck(force = false): void {
    if (!force && this.totalReceived === this.lastTotalAcked) return;
    this.lastTotalAcked = this.totalReceived;
    this.lastAckAt = Date.now();
    this.sendAck({ kind: "ack", bytes: this.totalReceived });
  }

  private setMode(mode: unknown): void {
    if (mode !== "turbo-wss" && mode !== "p2p-udp") return;
    this.mode = mode;
    this.ev.onChannelOpen(mode);
  }

  private onControlFrame(msg: Record<string, unknown>): void {
    const kind = msg.kind as string;
    if (kind === "mode") {
      this.setMode(msg.mode);
    } else if (kind === "start") {
      const i = Number(msg.i ?? 0);
      if (this.finalizedFiles.has(i)) return;
      this.setMode(msg.transport);
      const meta = {
        name: String(msg.name ?? `file-${i}`),
        size: Number(msg.size ?? 0),
        type: String(msg.mimeType ?? msg.fileType ?? "application/octet-stream"),
      };
      const cur = this.getOrCreateEntry(i);
      cur.name = meta.name;
      cur.size = meta.size;
      cur.type = meta.type;
      cur.expected = chunkCountOf(meta.size);
      cur.metaReady = true;

      this.ev.onFileStart(i, meta);
      if (cur.received > 0) this.ev.onProgress(i, cur.received);
      this.maybeFinalize(i, cur);
    } else if (kind === "end") {
      const i = Number(msg.i ?? 0);
      if (this.finalizedFiles.has(i)) {
        /* we already have it — the sender may have missed our `done` */
        this.sendAck({ kind: "done", i, bytes: this.totalReceived });
        return;
      }
      const cur = this.getOrCreateEntry(i);
      cur.endSeen = true;
      if (typeof msg.chunks === "number") cur.expected = msg.chunks;
      if (!this.maybeFinalize(i, cur)) this.requestMissing(i, cur, true);
    } else if (kind === "all-done") {
      this.flushAck(true);
      this.sendAck({ kind: "all-done", bytes: this.totalReceived });
      this.ev.onAllDone();
    }
  }

  private onBinaryChunk(buf: ArrayBuffer): void {
    if (this.disposed || buf.byteLength < HEADER_BYTES) return;
    const view = new DataView(buf);
    if (view.getUint32(0, true) !== HEADER_MAGIC) return;
    const fileIndex = view.getUint32(4, true);
    const seq = view.getUint32(8, true);
    if (this.finalizedFiles.has(fileIndex)) return;

    const cur = this.getOrCreateEntry(fileIndex);
    /* duplicates arrive when a chunk is re-sent or travels two paths — drop
       them, otherwise byte counts inflate and a file "completes" with holes */
    if (seq < cur.nextSeq || cur.chunksMap.has(seq)) return;

    const payload = buf.slice(HEADER_BYTES);
    cur.chunksMap.set(seq, payload);
    if (seq > cur.maxSeq) cur.maxSeq = seq;
    cur.lastChunkAt = Date.now();

    /* drain contiguous chunks into the ordered buffer */
    while (cur.chunksMap.has(cur.nextSeq)) {
      const part = cur.chunksMap.get(cur.nextSeq)!;
      cur.chunksMap.delete(cur.nextSeq);
      cur.orderedChunks.push(part);
      cur.orderedBytes += part.byteLength;
      cur.nextSeq += 1;
      if (cur.orderedBytes >= BLOB_COMPACT_BYTES) {
        cur.blobParts.push(new Blob(cur.orderedChunks));
        cur.orderedChunks = [];
        cur.orderedBytes = 0;
      }
    }

    cur.received += payload.byteLength;
    this.totalReceived += payload.byteLength;
    this.ev.onProgress(fileIndex, cur.received);

    if (!this.maybeFinalize(fileIndex, cur) && this.totalReceived - this.lastTotalAcked >= ACK_STEP) {
      this.flushAck();
    }
  }

  /* complete = every chunk 0..expected-1 arrived in order */
  private maybeFinalize(i: number, cur: IncomingFile): boolean {
    if (!cur.metaReady || cur.finalized) return false;
    if (cur.size > 0 && cur.nextSeq < cur.expected) return false;
    this.finalizeFile(i, cur);
    return true;
  }

  /* Ask the sender for chunks we know are missing: everything below the highest
     seen seq (or below `expected` once the sender said the file ended). */
  private requestMissing(i: number, cur: IncomingFile, force = false): void {
    const now = Date.now();
    if (!force && now - cur.lastNackAt < NACK_REPEAT_MS) return;
    const upper = cur.endSeen && cur.expected >= 0 ? cur.expected - 1 : cur.maxSeq;
    const seqs: number[] = [];
    for (let s = cur.nextSeq; s <= upper && seqs.length < NACK_MAX_SEQS; s++) {
      if (!cur.chunksMap.has(s)) seqs.push(s);
    }
    if (seqs.length === 0) return;
    cur.lastNackAt = now;
    this.sendAck({ kind: "resend", i, seqs, bytes: this.totalReceived });
  }

  private tick(): void {
    if (this.disposed) return;
    const now = Date.now();
    if (now - this.lastAckAt >= ACK_FLUSH_MS) this.flushAck();
    /* heartbeat, so the sender can tell a slow link from a vanished receiver */
    if (now - this.lastAckAt >= 2000 && this.incoming.size > 0) this.flushAck(true);
    for (const [i, cur] of this.incoming) {
      if (cur.finalized) continue;
      const idle = now - cur.lastChunkAt >= NACK_IDLE_MS;
      if (cur.endSeen || (idle && cur.maxSeq >= cur.nextSeq)) this.requestMissing(i, cur);
    }
  }

  private finalizeFile(i: number, cur: IncomingFile): void {
    cur.finalized = true;
    this.finalizedFiles.add(i);
    if (cur.orderedChunks.length > 0) {
      cur.blobParts.push(new Blob(cur.orderedChunks));
      cur.orderedChunks = [];
      cur.orderedBytes = 0;
    }
    const blob = new Blob(cur.blobParts, { type: cur.type || "application/octet-stream" });
    cur.blobParts = [];
    this.incoming.delete(i);
    this.flushAck(true);
    this.sendAck({ kind: "done", i, bytes: this.totalReceived });
    this.ev.onFileDone(i, { name: cur.name, size: cur.size, type: cur.type, blob });
  }

  private teardownPc(): void {
    try {
      this.dc?.close();
    } catch {}
    try {
      this.pc?.close();
    } catch {}
    this.dc = null;
    this.pc = null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
    this.teardownPc();
    this.closeLanes();
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
  }
}

/* Save a received blob to the user's device */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
