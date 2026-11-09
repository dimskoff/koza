/* koza box — high-performance, rock-solid P2P transfer engine.
   Signaling goes through wss://<host>/signal (see server/server.js),
   the bytes themselves travel browser → browser over an RTCDataChannel.

   Wire protocol on the RTCDataChannel:
     text   { kind: "start", i, name, size, type }   begin file i
     text   { kind: "done",  i, bytes }              receiver finalized file i (ack)
     text   { kind: "all-done" }                     sender announces all files sent;
                                                     receiver echoes "all-done" back to confirm
     binary ArrayBuffer                              file chunks (32 KiB slices)
*/

export interface TurnOffer {
  urls: string[];
  username?: string;
  credential?: string;
}

/* STUN always (Google + Cloudflare); TURN when backend has coturn configured */
let iceCache: RTCIceServer[] | null = null;
let iceCachedAt = 0;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (iceCache && now - iceCachedAt < 30 * 60 * 1000) return iceCache;
  const servers: RTCIceServer[] = [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"] },
    { urls: ["stun:stun.cloudflare.com:3478"] },
  ];
  try {
    const r = await fetch("/api/v1/turn", { signal: AbortSignal.timeout(4000) });
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
    /* STUN fallback is always available */
  }
  iceCache = servers;
  iceCachedAt = now;
  return servers;
}

export function signalUrl(): string {
  if (typeof window === "undefined") return "ws://localhost:8787/signal";

  // Optional manual overrides
  const custom = (window as unknown as { __KOZA_SIGNAL_URL?: string }).__KOZA_SIGNAL_URL;
  if (custom) return custom;
  if (process.env.NEXT_PUBLIC_SIGNAL_URL) return process.env.NEXT_PUBLIC_SIGNAL_URL;

  // Local development detection (dev Next.js on port 3000 proxies or points to port 8787)
  const host = window.location.hostname;
  const port = window.location.port;
  if (host === "localhost" || host === "127.0.0.1" || port === "3000") {
    return `ws://${host}:8787/signal`;
  }

  // Production same-origin via reverse proxy (/signal)
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/signal`;
}

/* ── shared signaling plumbing ─────────────────────────────────────── */

type SignalHandler = (msg: Record<string, unknown>) => void;

function openSignal(url: string, onMessage: SignalHandler, onClose: () => void): WebSocket {
  const ws = new WebSocket(url);
  ws.onmessage = (e) => {
    try {
      onMessage(JSON.parse(String(e.data)));
    } catch {
      /* non-json frame — ignore */
    }
  };
  ws.onclose = onClose;
  return ws;
}

/* ── backpressure & chunking constants ────────────────────────────────
   32 KiB chunks are universally supported by all browser SCTP stacks,
   NAT gateways, and MTU boundaries without SCTP packet fragmentation bugs.
   Chromium's internal dcSctp buffer limit is ~2 MiB.
   Pausing at 512 KiB and draining to 128 KiB guarantees the queue never
   overflows, and the pipe remains full for peak throughput (30–80+ MB/s). */
const CHUNK_SIZE = 32 * 1024; // 32 KiB
const READ_BLOCK_SIZE = 1024 * 1024; // 1 MiB disk read chunks
const BUFFER_LOW = 128 * 1024; // 128 KiB
const BUFFER_HIGH = 512 * 1024; // 512 KiB

function waitDrain(dc: RTCDataChannel): Promise<void> {
  if (dc.bufferedAmount <= BUFFER_LOW) return Promise.resolve();
  return new Promise((resolve, reject) => {
    let resolved = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const cleanup = () => {
      resolved = true;
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
      dc.removeEventListener("bufferedamountlow", onLow);
      dc.removeEventListener("close", onClose);
      dc.removeEventListener("error", onError);
    };

    const onLow = () => {
      if (resolved) return;
      cleanup();
      resolve();
    };

    const onClose = () => {
      if (resolved) return;
      cleanup();
      reject(new Error("Data channel closed while waiting for buffer drain"));
    };

    const onError = () => {
      if (resolved) return;
      cleanup();
      reject(new Error("Data channel error while waiting for buffer drain"));
    };

    dc.addEventListener("bufferedamountlow", onLow);
    dc.addEventListener("close", onClose);
    dc.addEventListener("error", onError);

    /* Safety fallback: browsers sometimes drop or delay the bufferedamountlow event.
       A fast poll guarantees we never deadlock. */
    timer = setInterval(() => {
      if (resolved) return;
      if (dc.readyState !== "open") {
        cleanup();
        reject(new Error("Data channel closed"));
        return;
      }
      if (dc.bufferedAmount <= BUFFER_LOW) {
        cleanup();
        resolve();
      }
    }, 20);
  });
}

/* ── sender ────────────────────────────────────────────────────────── */

export interface SenderEvents {
  onJoined(): void;
  onPeerJoined(): void;
  onPeerLeft(): void;
  onChannelOpen(): void;
  onProgress(bytesQueued: number): void;
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
  private candidateQueue: RTCIceCandidateInit[] = [];
  private makingOffer = false;

  constructor(private ev: SenderEvents) {}

  async connect(code: string, token: string): Promise<void> {
    this.code = code;
    this.token = token;
    // Pre-cache ICE servers so makeOffer does not have to wait
    void fetchIceServers();
    this.ws = openSignal(
      signalUrl(),
      (msg) => void this.onSignal(msg),
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
      // If receiver was already in the room when sender connected:
      if (Number(msg.peers) >= 2) {
        await this.makeOffer();
      }
      return;
    }

    if (type === "peer-joined" || type === "peer-ready") {
      this.ev.onPeerJoined();
      await this.makeOffer();
      return;
    }

    if (type === "peer-left") {
      this.ev.onPeerLeft();
      this.teardownPc();
      return;
    }

    if (type === "answer") {
      try {
        if (!this.pc) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: String(msg.sdp ?? "") });
        await this.flushCandidates();
      } catch {
        this.ev.onError("bad answer");
      }
      return;
    }

    if (type === "ice" && msg.candidate) {
      const cand = msg.candidate as RTCIceCandidateInit;
      if (this.pc && this.pc.remoteDescription) {
        try {
          await this.pc.addIceCandidate(cand);
        } catch {
          /* late or dead candidate */
        }
      } else {
        // Queue candidate until remote answer description is set
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
      } catch {
        /* ignore invalid candidate */
      }
    }
  }

  private async makeOffer(): Promise<void> {
    if (this.makingOffer || this.disposed) return;
    this.makingOffer = true;
    try {
      this.teardownPc();
      this.candidateQueue = [];

      const iceServers = await fetchIceServers();
      const pc = new RTCPeerConnection({ iceServers });
      this.pc = pc;

      const dc = pc.createDataChannel("koza", { ordered: true });
      dc.binaryType = "arraybuffer";
      dc.bufferedAmountLowThreshold = BUFFER_LOW;
      this.dc = dc;

      dc.onopen = () => {
        this.ev.onChannelOpen();
      };
      dc.onclose = () => {
        if (!this.disposed) this.ev.onPeerLeft();
      };
      dc.onmessage = (m) => {
        try {
          this.handleReceiverAck(JSON.parse(String(m.data)));
        } catch {
          /* not an ack */
        }
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) this.relay({ type: "ice", candidate: e.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") {
          this.ev.onError("webrtc connection failed");
        }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this.relay({ type: "offer", sdp: pc.localDescription?.sdp });
    } finally {
      this.makingOffer = false;
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, from: "sender" }));
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

  /* Push every staged file through the data channel; resolves after all-done ack */
  async sendFiles(files: File[]): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") throw new Error("channel is not open");

    for (let i = 0; i < files.length; i++) {
      if (this.disposed || dc.readyState !== "open") throw new Error("channel closed mid-flight");
      const file = files[i];
      dc.send(JSON.stringify({ kind: "start", i, name: file.name, size: file.size, type: file.type }));
      this.ev.onFileQueued(i);

      let offset = 0;
      while (offset < file.size) {
        if (this.disposed || dc.readyState !== "open") throw new Error("channel closed mid-flight");

        // Read a larger 1 MiB block from disk into memory
        const blockEnd = Math.min(file.size, offset + READ_BLOCK_SIZE);
        const blockBuf = await file.slice(offset, blockEnd).arrayBuffer();

        // Send 32 KiB chunks from memory buffer
        let blockOffset = 0;
        while (blockOffset < blockBuf.byteLength) {
          if (this.disposed || dc.readyState !== "open") throw new Error("channel closed mid-flight");

          if (dc.bufferedAmount >= BUFFER_HIGH) {
            await waitDrain(dc);
          }

          const sliceLen = Math.min(CHUNK_SIZE, blockBuf.byteLength - blockOffset);
          const chunk = blockBuf.slice(blockOffset, blockOffset + sliceLen);
          dc.send(chunk);

          blockOffset += sliceLen;
          this.queued += sliceLen;
          this.ev.onProgress(this.queued);
        }

        offset = blockEnd;
      }
    }

    // Wait until channel buffer is completely empty
    while (dc.bufferedAmount > 0 && dc.readyState === "open" && !this.disposed) {
      await waitDrain(dc);
      if (dc.bufferedAmount === 0) break;
      await new Promise((r) => setTimeout(r, 20));
    }

    if (dc.readyState === "open" && !this.disposed) {
      dc.send(JSON.stringify({ kind: "all-done" }));
    }
  }

  /* The receiver confirms per-file and overall delivery */
  handleReceiverAck(msg: Record<string, unknown>): void {
    const kind = msg.kind as string;
    if (kind === "done") {
      this.ev.onFileDone(Number(msg.i ?? 0));
    } else if (kind === "all-done") {
      this.ev.onAllDone();
    }
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

/* ── receiver ──────────────────────────────────────────────────────── */

export interface IncomingFile {
  name: string;
  size: number;
  type: string;
  chunks: ArrayBuffer[];
  received: number;
}

export interface ReceiverEvents {
  onJoined(): void;
  onPeerLeft(): void;
  onChannelOpen(): void;
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
  private candidateQueue: RTCIceCandidateInit[] = [];

  constructor(private ev: ReceiverEvents) {}

  async connect(code: string, password?: string): Promise<void> {
    this.code = code;
    // Pre-cache ICE servers in background so answerOffer runs with zero delay
    void fetchIceServers();
    this.ws = openSignal(
      signalUrl(),
      (msg) => void this.onSignal(msg),
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    this.ws.onopen = () => {
      this.ws?.send(
        JSON.stringify({ type: "join", code: this.code, role: "receiver", password: password ?? "" }),
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

    if (type === "peer-left") {
      this.ev.onPeerLeft();
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
        } catch {
          /* late or dead candidate */
        }
      } else {
        // Queue early candidate until setRemoteDescription finishes
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
      } catch {
        /* ignore invalid candidate */
      }
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
        dc.onopen = () => this.ev.onChannelOpen();
        dc.onmessage = (m) => this.onChannelMessage(m.data);
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) this.relay({ type: "ice", candidate: e.candidate.toJSON() });
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "failed") this.ev.onError("webrtc connection failed");
      };

      await pc.setRemoteDescription({ type: "offer", sdp });
      await this.flushCandidates();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.relay({ type: "answer", sdp: pc.localDescription?.sdp });
    } catch {
      this.ev.onError("bad offer");
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ...msg, from: "receiver" }));
    }
  }

  private onChannelMessage(data: unknown): void {
    if (typeof data === "string") {
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(data);
      } catch {
        return;
      }
      const kind = msg.kind as string;
      if (kind === "start") {
        const i = Number(msg.i ?? 0);
        const meta = { name: String(msg.name ?? "file"), size: Number(msg.size ?? 0), type: String(msg.type ?? "") };
        this.incoming.set(i, { ...meta, chunks: [], received: 0 });
        this.current = i;
        this.ev.onFileStart(i, meta);
      } else if (kind === "all-done") {
        // CRITICAL FIX: Echo all-done ack back over the DATA CHANNEL to the sender!
        try {
          if (this.dc && this.dc.readyState === "open") {
            this.dc.send(JSON.stringify({ kind: "all-done" }));
          }
        } catch {}
        this.ev.onAllDone();
      }
      return;
    }

    const buf = data as ArrayBuffer;
    const cur = this.incoming.get(this.current);
    if (!cur) return;
    cur.chunks.push(buf);
    cur.received += buf.byteLength;
    this.totalReceived += buf.byteLength;
    this.ev.onProgress(this.current, cur.received);

    const i = this.current;
    if (cur.received >= cur.size) {
      const blob = new Blob(cur.chunks, { type: cur.type || "application/octet-stream" });
      cur.chunks = []; // free chunk buffers from memory immediately!
      this.incoming.delete(i);
      try {
        if (this.dc && this.dc.readyState === "open") {
          this.dc.send(JSON.stringify({ kind: "done", i, bytes: this.totalReceived }));
        }
      } catch {}
      this.ev.onFileDone(i, { name: cur.name, size: cur.size, type: cur.type, blob });
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
