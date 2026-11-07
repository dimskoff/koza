/* koza box — the real p2p transfer engine.
   Signaling goes through wss://<host>/signal (see server/server.js),
   the bytes themselves travel browser → browser over an RTCDataChannel.

   wire protocol on the channel:
     text  { kind: "start", i, name, size, type }   begin file i
     text  { kind: "done",  i }                     receiver finalized file i (ack)
     text  { kind: "ack",   i, bytes }              receiver byte-count ack
     text  { kind: "all-done" }                     every file delivered
     binary ArrayBuffer                                  file chunk            */

export interface TurnOffer {
  urls: string[];
  username?: string;
  credential?: string;
}

/* stun always; turn when the backend has coturn configured */
let iceCache: RTCIceServer[] | null = null;
let iceCachedAt = 0;

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  const now = Date.now();
  if (iceCache && now - iceCachedAt < 30 * 60 * 1000) return iceCache;
  const servers: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
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
    /* stun-only is fine */
  }
  iceCache = servers;
  iceCachedAt = now;
  return servers;
}

export function signalUrl(): string {
  /* dev: next dev has no /signal — talk to the backend directly */
  if (typeof window !== "undefined" && window.location.hostname === "localhost") {
    return "ws://localhost:8787/signal";
  }
  /* prod: same origin — traefik routes /signal to the koza api */
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

const CHUNK = 64 * 1024; // 64 KiB — safe for every browser
const HIGH_WATER = 4 * 1024 * 1024;

function waitDrain(dc: RTCDataChannel): Promise<void> {
  if (dc.bufferedAmount < HIGH_WATER) return Promise.resolve();
  return new Promise((resolve) => {
    const onLow = () => {
      dc.removeEventListener("bufferedamountlow", onLow);
      resolve();
    };
    dc.addEventListener("bufferedamountlow", onLow);
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
  private polite = false; // ice-collision guard (perfect negotiation lite)

  constructor(private ev: SenderEvents) {}

  async connect(code: string, token: string): Promise<void> {
    this.code = code;
    this.token = token;
    this.ws = openSignal(
      signalUrl(),
      (msg) => void this.onSignal(msg),
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    this.ws.onopen = () => {
      this.ws?.send(JSON.stringify({ type: "join", code: this.code, role: "sender", token: this.token }));
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
    if (type === "peer-joined") {
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
        await this.pc?.setRemoteDescription({ type: "answer", sdp: String(msg.sdp ?? "") });
      } catch {
        this.ev.onError("bad answer");
      }
      return;
    }
    if (type === "ice" && msg.candidate) {
      try {
        await this.pc?.addIceCandidate(msg.candidate as RTCIceCandidateInit);
      } catch {
        /* late or dead candidate */
      }
      return;
    }
  }

  private async makeOffer(): Promise<void> {
    this.teardownPc();
    const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
    this.pc = pc;
    this.polite = false;

    const dc = pc.createDataChannel("koza", { ordered: true });
    dc.binaryType = "arraybuffer";
    dc.bufferedAmountLowThreshold = 1024 * 1024;
    this.dc = dc;
    dc.onopen = () => this.ev.onChannelOpen();
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
      if (pc.connectionState === "failed") this.ev.onError("webrtc connection failed");
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.relay({ type: "offer", sdp: pc.localDescription?.sdp });
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ ...msg, from: "sender" }));
  }

  private teardownPc(): void {
    try {
      this.dc?.close();
    } catch {
      /* gone */
    }
    try {
      this.pc?.close();
    } catch {
      /* gone */
    }
    this.dc = null;
    this.pc = null;
  }

  /* push every staged file through the channel; resolves after all-done ack */
  async sendFiles(files: File[]): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.readyState !== "open") throw new Error("channel is not open");

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      dc.send(JSON.stringify({ kind: "start", i, name: file.name, size: file.size, type: file.type }));
      this.ev.onFileQueued(i);

      let offset = 0;
      while (offset < file.size) {
        await waitDrain(dc);
        if (this.disposed || dc.readyState !== "open") throw new Error("channel closed mid-flight");
        const buf = await file.slice(offset, offset + CHUNK).arrayBuffer();
        dc.send(buf);
        offset += buf.byteLength;
        this.queued += buf.byteLength;
        this.ev.onProgress(this.queued);
      }
    }

    /* every byte is out — announce it; the receiver echoes the
       all-done ack back, which completes both sides (and closes the room) */
    dc.send(JSON.stringify({ kind: "all-done" }));
  }

  /* the receiver confirms per-file and overall delivery */
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
    } catch {
      /* gone */
    }
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

  constructor(private ev: ReceiverEvents) {}

  async connect(code: string, password?: string): Promise<void> {
    this.code = code;
    this.ws = openSignal(
      signalUrl(),
      (msg) => void this.onSignal(msg),
      () => {
        if (!this.disposed) this.ev.onError("signal line dropped");
      },
    );
    /* the server validates the password against the room hash */
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
      try {
        await this.pc?.addIceCandidate(msg.candidate as RTCIceCandidateInit);
      } catch {
        /* late or dead candidate */
      }
    }
  }

  private async answerOffer(sdp: string): Promise<void> {
    try {
      const pc = new RTCPeerConnection({ iceServers: await fetchIceServers() });
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
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.relay({ type: "answer", sdp: pc.localDescription?.sdp });
    } catch {
      this.ev.onError("bad offer");
    }
  }

  private relay(msg: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ ...msg, from: "receiver" }));
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
        this.relay({ kind: "all-done" });
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

    /* coarse acks so the sender's progress mirrors reality */
    const i = this.current;
    if (cur.received >= cur.size) {
      const blob = new Blob(cur.chunks, { type: cur.type || "application/octet-stream" });
      this.incoming.delete(i);
      this.dc?.send(JSON.stringify({ kind: "done", i, bytes: this.totalReceived }));
      this.ev.onFileDone(i, { name: cur.name, size: cur.size, type: cur.type, blob });
    } else if (cur.received % (1024 * 1024) < CHUNK) {
      try {
        this.dc?.send(JSON.stringify({ kind: "ack", i, bytes: this.totalReceived }));
      } catch {
        /* acks are best-effort */
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    try {
      this.dc?.close();
    } catch {
      /* gone */
    }
    try {
      this.pc?.close();
    } catch {
      /* gone */
    }
    try {
      this.ws?.close();
    } catch {
      /* gone */
    }
    this.ws = null;
  }
}

/* save a received blob to the user's device */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
