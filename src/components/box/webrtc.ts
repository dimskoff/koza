/* koza box v2 — Hybrid Direct-UDP WebRTC + Zero-Copy WSS Turbo Transfer Engine.
   Automatically uses Direct UDP WebRTC when both peers have a direct non-relay
   UDP path (LAN / open NAT), and seamlessly switches to the Zero-Copy Binary
   WebSocket Turbo Pipe over TLS (:443) when behind VPNs, proxies, Symmetric
   CGNAT, or TURN relays — completely eliminating the 200 KB/s TURN-TCP SCTP
   bottleneck and 2.4 MB buffer freeze. */

export interface TurnOffer {
  urls: string[];
  username?: string;
  credential?: string;
}

export type TransportMode = "connecting" | "p2p-udp" | "turbo-wss";

let iceCache: RTCIceServer[] | null = null;
let iceCachedAt = 0;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (iceCache && now - iceCachedAt < 30 * 60 * 1000) return iceCache;
  const servers: RTCIceServer[] = [
    {
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun.cloudflare.com:3478",
      ],
    },
  ];
  try {
    const r = await fetch("/api/v1/turn", { signal: AbortSignal.timeout(3500) });
    if (r.ok) {
      const data = (await r.json()) as { turn: TurnOffer | null };
      if (data.turn?.urls?.length) {
        servers.push({
          urls: data.turn.urls,
          username: data.turn.username,
          credential: data.turn.credential,
        });
      }
    }
  } catch {
    /* STUN fallback */
  }
  iceCache = servers;
  iceCachedAt = now;
  return servers;
}

export function signalUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8787/signal";
  const custom = (window as unknown as { __KOZA_SIGNAL_URL?: string }).__KOZA_SIGNAL_URL;
  if (custom) return custom;
  if (process.env.NEXT_PUBLIC_SIGNAL_URL) return process.env.NEXT_PUBLIC_SIGNAL_URL;

  const host = window.location.hostname;
  const port = window.location.port;
  if (host === "localhost" || host === "127.0.0.1" || port === "3000") {
    return `ws://${host}:8787/signal`;
  }

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/signal`;
}

/* ── shared signaling + binary socket plumbing ──────────────────────── */

type JsonHandler = (msg: Record<string, unknown>) => void;
type BinaryHandler = (buf: ArrayBuffer) => void;

function openSignal(
  url: string,
  onJson: JsonHandler,
  onBinary: BinaryHandler,
  onClose: () => void,
): WebSocket {
  const ws = new WebSocket(url);
  ws.binaryType = "arraybuffer";
  ws.onmessage = (e) => {
    if (typeof e.data === "string") {
      try {
        onJson(JSON.parse(e.data));
      } catch {
        /* ignore malformed json */
      }
    } else if (e.data instanceof ArrayBuffer) {
      onBinary(e.data);
    } else if (typeof Blob !== "undefined" && e.data instanceof Blob) {
      void e.data.arrayBuffer().then(onBinary);
    }
  };
  ws.onclose = onClose;
  return ws;
}

/* ── high-speed chunking & flow control constants ───────────────────── */
const READ_BLOCK_SIZE = 4 * 1024 * 1024; // 4 MiB disk read block (zero-copy sliced in RAM)
const WSS_CHUNK_SIZE = 256 * 1024; // 256 KiB binary frame for WSS Turbo Pipe
const RTC_CHUNK_SIZE = 64 * 1024; // 64 KiB binary frame for Direct UDP WebRTC

const DC_BUFFER_LOW = 256 * 1024; // 256 KiB
const DC_BUFFER_HIGH = 1024 * 1024; // 1 MiB
const WS_BUFFER_LOW = 1024 * 1024; // 1 MiB
const WS_BUFFER_HIGH = 4 * 1024 * 1024; // 4 MiB
const MAX_IN_FLIGHT = 12 * 1024 * 1024; // 12 MiB end-to-end unacknowledged window
const ACK_STEP = 512 * 1024; // Receiver sends ACK every 512 KiB
const BLOB_COMPACT_BYTES = 16 * 1024 * 1024; // Compact ArrayBuffers into Blob every 16 MiB

/* Inspect whether an open RTCPeerConnection is using a true direct UDP route
   (host / srflx / prflx) vs a slow TURN relay. */
async function isDirectUdpConnection(pc: RTCPeerConnection): Promise<boolean> {
  try {
    const stats = await pc.getStats();
    let selectedLocalId = "";
    let selectedRemoteId = "";
    stats.forEach((report) => {
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        (report.selected || report.nominated)
      ) {
        selectedLocalId = report.localCandidateId;
        selectedRemoteId = report.remoteCandidateId;
      }
    });
    if (!selectedLocalId || !selectedRemoteId) return false;
    let localType = "";
    let remoteType = "";
    let localProto = "";
    stats.forEach((report) => {
      if (report.id === selectedLocalId) {
        localType = String(report.candidateType || "");
        localProto = String(report.protocol || "").toLowerCase();
      }
      if (report.id === selectedRemoteId) {
        remoteType = String(report.candidateType || "");
      }
    });
    if (localType === "relay" || remoteType === "relay") return false;
    if (localProto && localProto !== "udp") return false;
    return true;
  } catch {
    return false;
  }
}

/* ── sender ────────────────────────────────────────────────────────── */

export interface SenderEvents {
  onJoined(): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onChannelOpen(mode?: TransportMode): void;
  onProgress(bytesDelivered: number): void;
  onFileQueued(index: number): void;
  onFileDone(index: number): void;
  onAllDone(): void;
  onError(reason: string): void;
}

export class BoxSender {
  private ws: WebSocket | null = null;
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
  private mode: TransportMode = "connecting";
  private fallbackTimer: ReturnType<typeof setTimeout> | null = null;
  private ackWaiters: Array<() => void> = [];

  constructor(private ev: SenderEvents) {}

  get transportMode(): TransportMode {
    return this.mode;
  }

  async connect(code: string, token: string): Promise<void> {
    this.code = code;
    this.token = token;
    void fetchIceServers();
    this.ws = openSignal(
      signalUrl(),
      (msg) => void this.onSignal(msg),
      () => {
        /* sender does not receive binary frames */
      },
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({ type: "join", code: this.code, role: "sender", token: this.token }),
      );
    };
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

    if (type === "peer-left" || type === "bye") {
      this.ev.onPeerLeft();
      this.teardownPc();
      return;
    }

    if (type === "xfer") {
      this.handleReceiverAck(msg);
      return;
    }

    if (type === "answer") {
      try {
        if (!this.pc) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: String(msg.sdp ?? "") });
        await this.flushCandidates();
      } catch {
        /* fallback timer will activate ws-turbo if webrtc fails */
      }
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

  private activateTransport(chosen: TransportMode): void {
    if (this.channelOpened || this.disposed) return;
    this.channelOpened = true;
    this.mode = chosen;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    if (chosen === "turbo-wss") {
      /* Close unneeded RTCPeerConnection so TURN/SCTP doesn't waste bandwidth */
      this.teardownPc();
    }
    this.ev.onChannelOpen(chosen);
  }

  private async startNegotiation(): Promise<void> {
    if (this.makingOffer || this.disposed) return;
    this.makingOffer = true;
    this.channelOpened = false;

    /* Race timer: if Direct UDP WebRTC doesn't open within 1100ms (e.g. VPN,
       Blocked UDP, or Symmetric NAT), immediately launch Turbo WSS Pipe! */
    if (this.fallbackTimer) clearTimeout(this.fallbackTimer);
    this.fallbackTimer = setTimeout(() => {
      if (!this.channelOpened && !this.disposed && this.ws?.readyState === WebSocket.OPEN) {
        this.activateTransport("turbo-wss");
      }
    }, 1100);

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
        if (this.channelOpened || this.disposed) return;
        const directUdp = await isDirectUdpConnection(pc);
        if (directUdp) {
          this.activateTransport("p2p-udp");
        } else {
          /* Selected route is TURN relay! Never use SCTP-over-TURN-TCP (200 KB/s);
             switch immediately to Zero-Copy Binary WebSocket Turbo Pipe! */
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
          const candStr = e.candidate.candidate || "";
          /* If receiver or sender only has TCP relay or we want fast trickle: relay it */
          this.relay({ type: "ice", candidate: e.candidate.toJSON() });
          void candStr;
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          (pc.connectionState === "failed" || pc.connectionState === "disconnected") &&
          !this.channelOpened &&
          this.ws?.readyState === WebSocket.OPEN
        ) {
          this.activateTransport("turbo-wss");
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

  private sendControl(payload: Record<string, unknown>): void {
    if (this.mode === "p2p-udp" && this.dc?.readyState === "open") {
      this.dc.send(JSON.stringify(payload));
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "xfer", ...payload }));
    } else {
      throw new Error("transport channel closed");
    }
  }

  private sendBinaryChunk(chunk: Uint8Array): void {
    if (this.mode === "p2p-udp" && this.dc?.readyState === "open") {
      this.dc.send(chunk);
    } else if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(chunk);
    } else {
      throw new Error("transport channel closed mid-flight");
    }
  }

  private async waitBackpressure(): Promise<void> {
    while (!this.disposed) {
      const inFlight = this.queued - this.ackedBytes;
      if (this.mode === "p2p-udp") {
        const dc = this.dc;
        if (!dc || dc.readyState !== "open") {
          /* Seamless mid-flight failover from dropped WebRTC to WSS Turbo Pipe! */
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.mode = "turbo-wss";
            return;
          }
          throw new Error("data channel closed");
        }
        if (dc.bufferedAmount < DC_BUFFER_HIGH && inFlight < MAX_IN_FLIGHT) return;
      } else {
        const ws = this.ws;
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          throw new Error("signal connection closed");
        }
        if (ws.bufferedAmount < WS_BUFFER_HIGH && inFlight < MAX_IN_FLIGHT) return;
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 12);
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

  /* Stream all staged files with zero-copy 4 MiB disk reads and sliding-window backpressure */
  async sendFiles(files: File[]): Promise<void> {
    this.queued = 0;
    this.ackedBytes = 0;

    for (let i = 0; i < files.length; i++) {
      if (this.disposed) throw new Error("transfer cancelled");
      const file = files[i];

      this.sendControl({
        kind: "start",
        i,
        name: file.name,
        size: file.size,
        type: file.type || "application/octet-stream",
        transport: this.mode,
      });
      this.ev.onFileQueued(i);

      let offset = 0;
      while (offset < file.size) {
        if (this.disposed) throw new Error("transfer cancelled");

        const blockEnd = Math.min(file.size, offset + READ_BLOCK_SIZE);
        const blockBuf = await file.slice(offset, blockEnd).arrayBuffer();

        let blockOffset = 0;
        while (blockOffset < blockBuf.byteLength) {
          if (this.disposed) throw new Error("transfer cancelled");

          await this.waitBackpressure();

          const chunkSize = this.mode === "p2p-udp" ? RTC_CHUNK_SIZE : WSS_CHUNK_SIZE;
          const sliceLen = Math.min(chunkSize, blockBuf.byteLength - blockOffset);
          /* Zero-copy Uint8Array view into the 4 MiB ArrayBuffer */
          const chunkView = new Uint8Array(blockBuf, blockOffset, sliceLen);

          try {
            this.sendBinaryChunk(chunkView);
          } catch {
            /* If WebRTC DataChannel threw Queue Full / Error, failover to WSS Turbo! */
            if (this.mode === "p2p-udp" && this.ws?.readyState === WebSocket.OPEN) {
              this.mode = "turbo-wss";
              this.teardownPc();
              this.sendBinaryChunk(chunkView);
            } else {
              throw new Error("failed to send chunk");
            }
          }

          blockOffset += sliceLen;
          this.queued += sliceLen;
          /* Report smooth progress anchored to real network drain */
          const buffered =
            this.mode === "p2p-udp"
              ? (this.dc?.bufferedAmount ?? 0)
              : (this.ws?.bufferedAmount ?? 0);
          const networkSent = Math.max(this.ackedBytes, this.queued - buffered);
          this.ev.onProgress(networkSent);
        }

        offset = blockEnd;
      }

      /* Wait for local socket buffer to flush before marking file end */
      while (!this.disposed) {
        const buffered =
          this.mode === "p2p-udp"
            ? (this.dc?.bufferedAmount ?? 0)
            : (this.ws?.bufferedAmount ?? 0);
        if (buffered <= WS_BUFFER_LOW) break;
        await new Promise((r) => setTimeout(r, 15));
      }
    }

    if (!this.disposed) {
      this.sendControl({ kind: "all-done" });
    }
  }

  handleReceiverAck(msg: Record<string, unknown>): void {
    const kind = msg.kind as string;
    if (typeof msg.bytes === "number" && msg.bytes > this.ackedBytes) {
      this.ackedBytes = msg.bytes;
      this.ev.onProgress(this.ackedBytes);
      const waiters = this.ackWaiters.splice(0, this.ackWaiters.length);
      for (const w of waiters) w();
    }
    if (kind === "done") {
      this.ev.onFileDone(Number(msg.i ?? 0));
    } else if (kind === "all-done") {
      this.ev.onAllDone();
    }
  }

  dispose(): void {
    this.disposed = true;
    if (this.fallbackTimer) {
      clearTimeout(this.fallbackTimer);
      this.fallbackTimer = null;
    }
    const waiters = this.ackWaiters.splice(0, this.ackWaiters.length);
    for (const w of waiters) w();
    this.teardownPc();
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
  blobParts: Blob[];
  chunks: ArrayBuffer[];
  chunkBytes: number;
  received: number;
  lastAcked: number;
}

export interface ReceiverEvents {
  onJoined(): void;
  onPeerLeft(): void;
  onChannelOpen(mode?: TransportMode): void;
  onFileStart(index: number, meta: { name: string; size: number; type: string }): void;
  onProgress(index: number, bytes: number): void;
  onFileDone(index: number, file: { name: string; size: number; type: string; blob: Blob }): void;
  onAllDone(): void;
  onError(reason: string): void;
}

export class BoxReceiver {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private code = "";
  private disposed = false;
  private incoming = new Map<number, IncomingFile>();
  private current = -1;
  private totalReceived = 0;
  private lastTotalAcked = 0;
  private candidateQueue: RTCIceCandidateInit[] = [];
  private mode: TransportMode = "connecting";

  constructor(private ev: ReceiverEvents) {}

  get transportMode(): TransportMode {
    return this.mode;
  }

  async connect(code: string, password?: string): Promise<void> {
    this.code = code;
    void fetchIceServers();
    this.ws = openSignal(
      signalUrl(),
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
          password: password ?? "",
        }),
      );
    };
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

    if (type === "xfer") {
      this.onControlFrame(msg);
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
        dc.onopen = () => {
          this.mode = "p2p-udp";
          this.ev.onChannelOpen("p2p-udp");
        };
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
      /* If WebRTC fails on receiver, WSS Turbo Pipe still works automatically */
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, from: "receiver" }));
    }
  }

  private sendAck(payload: Record<string, unknown>): void {
    if (this.dc?.readyState === "open") {
      try {
        this.dc.send(JSON.stringify(payload));
        return;
      } catch {}
    }
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify({ type: "xfer", ...payload }));
      } catch {}
    }
  }

  private onControlFrame(msg: Record<string, unknown>): void {
    const kind = msg.kind as string;
    if (kind === "start") {
      const i = Number(msg.i ?? 0);
      if (msg.transport === "turbo-wss" || msg.transport === "p2p-udp") {
        this.mode = msg.transport;
        this.ev.onChannelOpen(this.mode);
      }
      const meta = {
        name: String(msg.name ?? "file"),
        size: Number(msg.size ?? 0),
        type: String(msg.type ?? "application/octet-stream"),
      };
      this.incoming.set(i, {
        ...meta,
        blobParts: [],
        chunks: [],
        chunkBytes: 0,
        received: 0,
        lastAcked: 0,
      });
      this.current = i;
      this.ev.onFileStart(i, meta);

      /* Handle 0-byte empty file edge case immediately */
      if (meta.size === 0) {
        this.finalizeFile(i);
      }
    } else if (kind === "all-done") {
      this.sendAck({ kind: "all-done", bytes: this.totalReceived });
      this.ev.onAllDone();
    }
  }

  private onBinaryChunk(buf: ArrayBuffer): void {
    const cur = this.incoming.get(this.current);
    if (!cur) return;

    cur.chunks.push(buf);
    cur.chunkBytes += buf.byteLength;
    cur.received += buf.byteLength;
    this.totalReceived += buf.byteLength;

    /* Compact ArrayBuffers into a Blob every 16 MiB so V8 JS heap stays < 32 MiB
       even when receiving multi-gigabyte files */
    if (cur.chunkBytes >= BLOB_COMPACT_BYTES) {
      cur.blobParts.push(new Blob(cur.chunks));
      cur.chunks = [];
      cur.chunkBytes = 0;
    }

    this.ev.onProgress(this.current, cur.received);

    if (cur.received >= cur.size) {
      this.finalizeFile(this.current);
    } else if (this.totalReceived - this.lastTotalAcked >= ACK_STEP) {
      this.lastTotalAcked = this.totalReceived;
      this.sendAck({ kind: "ack", i: this.current, bytes: this.totalReceived });
    }
  }

  private finalizeFile(i: number): void {
    const cur = this.incoming.get(i);
    if (!cur) return;
    if (cur.chunks.length > 0) {
      cur.blobParts.push(new Blob(cur.chunks));
      cur.chunks = [];
      cur.chunkBytes = 0;
    }
    const blob = new Blob(cur.blobParts, { type: cur.type || "application/octet-stream" });
    cur.blobParts = [];
    this.incoming.delete(i);
    this.lastTotalAcked = this.totalReceived;
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
    this.teardownPc();
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
