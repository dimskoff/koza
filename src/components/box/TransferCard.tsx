"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Link2,
  Plus,
  QrCode,
  RotateCcw,
  ShieldCheck,
  Timer,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { KozaQr } from "../koza/QrCode";
import {
  ConnectingDots,
  FileGlyph,
  KeepTabNote,
  PeerAvatar,
  PeerSpin,
  ScanSweep,
  TransferPanel,
} from "./visuals";
import { BoxSender } from "./webrtc";
import {
  type BoxFile,
  fmtDuration,
  fmtSpeed,
  hashPass,
  prettySize,
  shortLinkOf,
  SpeedMeter,
} from "./lib";

type Stage = "collect" | "waiting" | "handshake" | "moving" | "done" | "error";

/* rotating captions while the scope sweeps */
const SCAN_LINES = [
  "waiting on the signaling line",
  "your invite link is live — send it",
  "the line opens the moment they join",
  "punching a direct path · stun + turn",
  "listening for a peer",
];

export function TransferCard() {
  const [files, setFiles] = useState<BoxFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("collect");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [moved, setMoved] = useState<Record<string, number>>({});
  const [doneCount, setDoneCount] = useState(0);
  const doneCountRef = useRef(0);
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [summary, setSummary] = useState<{
    files: number;
    totalBytes: number;
    durationMs: number;
    avgBps: number;
    encrypted: boolean;
  } | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorReason, setErrorReason] = useState("");
  const [transportMode, setTransportMode] = useState<"p2p-udp" | "turbo-wss" | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<BoxSender | null>(null);
  const realFilesRef = useRef<File[]>([]);
  const codeRef = useRef("");
  const tokenRef = useRef("");
  const meterRef = useRef<SpeedMeter | null>(null);
  const t0Ref = useRef(0);
  const tick = useRef<number | null>(null);
  const movedRef = useRef<Record<string, number>>({});
  const linkCopiedTimer = useRef<number | null>(null);
  const stageRef = useRef<Stage>("collect");
  const lastUiUpdateRef = useRef(0);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(
    () => () => {
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      if (tick.current !== null) window.clearInterval(tick.current);
      engineRef.current?.dispose();
    },
    [],
  );

  const inRoom = stage === "waiting" || stage === "handshake" || stage === "moving";
  const locked = password.trim().length >= 4;

  /* native guard — the browser itself asks before the tab dies mid-flight */
  useEffect(() => {
    if (!inRoom) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [inRoom]);

  /* rotating captions while searching */
  useEffect(() => {
    if (stage !== "waiting") return;
    const id = window.setInterval(() => setScanIdx((i) => i + 1), 1700);
    return () => window.clearInterval(id);
  }, [stage]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next: BoxFile[] = Array.from(list).map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
    }));
    realFilesRef.current = [...realFilesRef.current, ...Array.from(list)].slice(0, 12);
    setFiles((prev) => [...prev, ...next].slice(0, 12));
    if (next.length) toast.success(`${next.length} file${next.length > 1 ? "s" : ""} staged`);
  };

  const closeRoom = useCallback((c: string, token: string) => {
    if (!c || !token) return;
    try {
      void fetch(`/api/v1/box/rooms/${encodeURIComponent(c)}`, {
        method: "DELETE",
        headers: { "x-koza-token": token },
        keepalive: true,
      });
    } catch {
      /* the room expires on its own anyway */
    }
  }, []);

  const stopClock = () => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  };

  const startTransfer = async () => {
    if (files.length === 0) return;
    const pw = password.trim();
    if (pw.length > 0 && pw.length < 4) {
      toast.error("Password is too short", { description: "Use at least 4 characters" });
      return;
    }

    setStage("collect");
    setErrorReason("");
    let created: { room?: { code?: string }; sender_token?: string; error?: string } | null = null;
    try {
      const r = await fetch("/api/v1/box/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: files.map((f) => ({ name: f.name, size: f.size })),
          ...(pw ? { passwordHash: hashPass(pw) } : {}),
        }),
      });
      created = await r.json();
    } catch {
      created = { error: "network" };
    }
    if (!created?.room?.code || !created?.sender_token) {
      toast.error("Could not open the line", {
        description: created?.error ?? "the koza api is not responding — try again in a moment",
      });
      return;
    }

    const c = created.room.code;
    const token = created.sender_token;
    codeRef.current = c;
    tokenRef.current = token;
    setCode(c);
    movedRef.current = {};
    setMoved({});
    doneCountRef.current = 0;
    setDoneCount(0);
    setSpeed(0);
    setEta(0);
    setSummary(null);
    setElapsed(0);
    setScanIdx(0);
    setStage("waiting");
    toast.warning("Keep this tab open", {
      description: "The direct line dies with the tab.",
    });

    /* heartbeat: elapsed clock + smoothed speed display */
    t0Ref.current = Date.now();
    lastUiUpdateRef.current = 0;
    stopClock();
    tick.current = window.setInterval(() => {
      setElapsed(Date.now() - t0Ref.current);
      setMoved({ ...movedRef.current });
      const meter = meterRef.current;
      if (meter) {
        setSpeed(meter.bps);
        const total = files.reduce((a, f) => a + f.size, 0);
        const movedBytes = Object.values(movedRef.current).reduce((a, b) => a + b, 0);
        setEta(meter.bps > 0 ? ((total - movedBytes) / meter.bps) * 1000 : 0);
      }
    }, 250);

    /* one completion path: the summary, the room cleanup, the exit —
       reached either through the all-done ack or the graceful peer-left */
    const finish = () => {
      if (stageRef.current === "done") return;
      stopClock();
      const total = files.reduce((a, f) => a + f.size, 0);
      const durationMs = Math.max(400, Date.now() - t0Ref.current);
      setSummary({
        files: files.length,
        totalBytes: total,
        durationMs,
        avgBps: total / (durationMs / 1000),
        encrypted: pw.length > 0,
      });
      setStage("done");
      engineRef.current?.dispose();
      engineRef.current = null;
      closeRoom(c, token);
      toast.success("Delivered", { description: "The line is closed now." });
    };

    const engine = new BoxSender({
      onJoined: () => setStage((s) => (s === "waiting" ? "waiting" : s)),
      onPeerJoined: () => setStage((s) => (s !== "done" ? "handshake" : s)),
      onPeerLeft: () => {
        const st = stageRef.current;
        if (st === "moving" || st === "handshake") {
          /* the receiver tears its line down right after the last ack —
             if every file is already confirmed this is completion,
             not a drop (the final all-done frame can lose the race) */
          if (doneCountRef.current >= files.length && files.length > 0) {
            finish();
            return;
          }
          stopClock();
          setErrorReason("the peer dropped — the line closed");
          setStage("error");
        }
      },
      onChannelOpen: (mode) => {
        setTransportMode(mode);
        meterRef.current = new SpeedMeter();
        setStage("moving");
        const sender = engineRef.current;
        if (!sender) return;
        sender.sendFiles(realFilesRef.current).catch((err) => {
          stopClock();
          setErrorReason(String(err?.message ?? err));
          setStage("error");
        });
      },
      onProgress: (queued) => {
        /* spread the cumulative byte count across staged files in order */
        let remaining = queued;
        const next: Record<string, number> = {};
        for (const f of files) {
          const take = Math.max(0, Math.min(f.size, remaining));
          next[f.id] = take;
          remaining -= take;
        }
        movedRef.current = next;
        meterRef.current?.push(queued);
        const now = Date.now();
        if (now - lastUiUpdateRef.current >= 100) {
          lastUiUpdateRef.current = now;
          setMoved({ ...next });
        }
      },
      onFileQueued: () => {
        /* bytes for this file start flowing */
      },
      onFileDone: () => {
        doneCountRef.current += 1;
        setDoneCount(doneCountRef.current);
        setMoved({ ...movedRef.current });
      },
      onAllDone: () => finish(),
      onError: (reason) => {
        if (stageRef.current === "done") return;
        stopClock();
        setErrorReason(reason);
        setStage("error");
      },
    });

    engineRef.current = engine;
    try {
      await engine.connect(c, token);
    } catch {
      setErrorReason("could not reach the signaling line");
      setStage("error");
    }
  };

  const resetAll = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    closeRoom(codeRef.current, tokenRef.current);
    codeRef.current = "";
    tokenRef.current = "";
    stopClock();
    meterRef.current = null;
    setFiles([]);
    realFilesRef.current = [];
    setStage("collect");
    setCode("");
    setSummary(null);
    movedRef.current = {};
    setMoved({});
    doneCountRef.current = 0;
    setDoneCount(0);
    setElapsed(0);
    setSpeed(0);
    setEta(0);
    setPassword("");
    setErrorReason("");
    setTransportMode(null);
  };

  const cancelTransfer = () => {
    engineRef.current?.dispose();
    engineRef.current = null;
    closeRoom(codeRef.current, tokenRef.current);
    codeRef.current = "";
    tokenRef.current = "";
    stopClock();
    meterRef.current = null;
    setStage("collect");
    movedRef.current = {};
    setMoved({});
    doneCountRef.current = 0;
    setDoneCount(0);
    setElapsed(0);
    setSpeed(0);
    setEta(0);
    setTransportMode(null);
    toast("Transfer cancelled — the room is closed");
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  /* the invite surface doubles as the copy button */
  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shortLinkOf(code));
      setLinkCopied(true);
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      linkCopiedTimer.current = window.setTimeout(() => setLinkCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const invite = shortLinkOf(code);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  const totalMoved = files.reduce((a, f) => a + (moved[f.id] ?? 0), 0);
  const overall = totalBytes > 0 ? Math.min(100, (totalMoved / totalBytes) * 100) : 0;
  const etaMs = speed > 0 ? ((totalBytes - totalMoved) / speed) * 1000 : 0;

  /* ──────────────────────────────────────────────────────────── */
  return (
    <div className="kz-edge w-full max-w-xl" id="transfer">
      {/* stage strip */}
      <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
        <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
          {stage === "collect" && "01 · stage files"}
          {stage === "waiting" && "02 · searching for a peer"}
          {stage === "handshake" && "02 · handshake"}
          {stage === "moving" && "03 · moving bytes"}
          {stage === "done" && "04 · delivered"}
          {stage === "error" && "line trouble"}
        </span>
        <span className="flex items-center gap-3">
          {stage === "moving" && transportMode && (
            <span className="kz-mono flex items-center gap-1.5 text-[11px] text-emerald-400">
              <Zap className="h-3 w-3" />
              {transportMode === "p2p-udp" ? "direct udp" : "turbo stream"}
            </span>
          )}
          {locked && stage !== "done" && (
            <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-coral)]">
              <ShieldCheck className="h-3.5 w-3.5" /> locked
            </span>
          )}
          {inRoom && (
            <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-smoke)]">
              <Timer className="h-3.5 w-3.5" />
              {fmtDuration(elapsed)}
            </span>
          )}
        </span>
      </div>

      {/* ── COLLECT / READY ─────────────────────────────────────── */}
      {stage === "collect" && (
        <div className="p-5 sm:p-6">
          {/* dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
            }}
            role="button"
            tabIndex={0}
            aria-label="Drop files here or press Enter to browse"
            className={`kz-inset relative flex cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--kz-hairline-strong)] px-6 py-9 text-center transition-colors duration-150 ${
              dragging
                ? "!border-[var(--kz-coral)] bg-[rgba(255,99,99,0.06)]"
                : "hover:bg-white/[0.05]"
            }`}
          >
            <div
              className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04] transition-transform duration-150 ${dragging ? "scale-110" : ""}`}
              aria-hidden="true"
            >
              <Zap className="h-5 w-5 text-[var(--kz-coral)]" />
            </div>
            <p className="text-[16px] font-medium text-[var(--kz-mist)]">Drop files here</p>
            <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
              or press to browse · any type · stays on your device
            </p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = "";
              }}
              aria-hidden="true"
              tabIndex={-1}
            />
          </div>

          {/* file chips */}
          {files.length > 0 && (
            <ul className="mt-4 space-y-2" aria-label="Staged files">
              <AnimatePresence initial={false}>
                {files.map((f) => (
                  <motion.li
                    key={f.id}
                    layout
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="kz-inset flex items-center gap-3 px-3 py-2.5"
                  >
                    <FileGlyph name={f.name} />
                    <div className="min-w-0 flex-1">
                      <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">{f.name}</p>
                      <p className="kz-mono mt-0.5 text-[11px] text-[var(--kz-smoke)]">
                        {prettySize(f.size)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFiles((prev) => prev.filter((x) => x.id !== f.id));
                      }}
                      className="kz-ghost-btn shrink-0 rounded-lg p-1.5"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          )}

          {/* options — password is an open, optional field */}
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="mt-5 space-y-4"
            >
              <div className="kz-inset flex items-center gap-2.5 px-3.5 py-3">
                <KeyRound
                  className={`h-4 w-4 shrink-0 transition-colors ${
                    password ? "text-[var(--kz-coral)]" : "text-[var(--kz-smoke)]"
                  }`}
                />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  placeholder="password — optional"
                  aria-label="Optional room password"
                  autoComplete="off"
                  className="kz-mono w-full min-w-0 bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                />
                {password && (
                  <button
                    onClick={() => setPassword("")}
                    className="kz-ghost-btn shrink-0 rounded-md p-1"
                    aria-label="Clear password"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button
                onClick={startTransfer}
                className="kz-cta flex h-12 w-full items-center justify-center gap-2 text-sm"
              >
                <Zap className="h-4 w-4" />
                Open direct line
                <ArrowRight className="h-4 w-4" />
              </button>
              <p className="kz-mono text-center text-[11px] text-[var(--kz-smoke)]">
                peer-to-peer · nothing is stored on the way
              </p>
            </motion.div>
          )}
        </div>
      )}

      {/* ── ROOM (waiting / handshake / moving) ─────────────────── */}
      {inRoom && (
        <div className="p-5 sm:p-6">
          {/* keep-the-tab-open note — one quiet line */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
          >
            <KeepTabNote />
          </motion.div>

          {/* invite link — calm row, the code is the hero without the circus */}
          <AnimatePresence initial={false}>
            {(stage === "waiting" || stage === "handshake") && (
              <motion.div
                key="invite"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
                className="overflow-hidden"
              >
                <div className="kz-inset mt-3 px-4 py-6">
                  {/* the code is the hero — tap anywhere to copy */}
                  <button
                    onClick={copyInvite}
                    className="group flex w-full flex-col items-center text-center"
                    title="Tap to copy"
                    aria-label="Copy invite link"
                  >
                    <p className="kz-mono flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-[var(--kz-smoke)]">
                      {linkCopied ? (
                        <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
                      ) : (
                        <Link2 className="h-3 w-3" />
                      )}
                      {linkCopied ? "copied — send it" : "send this link"}
                    </p>
                    <p
                      className="kz-mono mt-3.5 text-[32px] font-medium leading-none tracking-[0.18em] text-[var(--kz-mist)] transition-colors group-hover:text-[var(--kz-coral)]"
                    >
                      {code}
                    </p>
                    <p className="kz-mono mt-3 text-[11.5px] text-[var(--kz-smoke)]">
                      box.koza.click/r/{code}
                    </p>
                  </button>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      onClick={copyInvite}
                      className="kz-ghost-btn flex items-center gap-1.5 rounded-lg border border-[var(--kz-hairline)] px-3 py-1.5 text-[12px]"
                    >
                      {linkCopied ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" strokeWidth={2.5} />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                      {linkCopied ? "Copied" : "Copy link"}
                    </button>
                    <button
                      onClick={() => setQrOpen(true)}
                      className="kz-ghost-btn flex items-center gap-1.5 rounded-lg border border-[var(--kz-hairline)] px-3 py-1.5 text-[12px]"
                    >
                      <QrCode className="h-3.5 w-3.5" /> QR
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* status area — one line, no box */}
          <div className="mt-6 flex flex-col items-center text-center">
            <AnimatePresence mode="wait" initial={false}>
              {stage === "waiting" && (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.26 }}
                  className="flex flex-col items-center"
                >
                  <div className="flex items-center gap-2.5">
                    <PeerSpin />
                    <p className="text-[14px] font-medium text-[var(--kz-mist)]">
                      Waiting for a peer
                    </p>
                  </div>
                  <div className="kz-mono mt-2 h-4 overflow-hidden text-[11px] text-[var(--kz-smoke)]">
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.p
                        key={scanIdx}
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        exit={{ y: -10, opacity: 0 }}
                        transition={{ duration: 0.24 }}
                      >
                        {SCAN_LINES[scanIdx % SCAN_LINES.length]}
                      </motion.p>
                    </AnimatePresence>
                  </div>
                  <div className="mt-3">
                    <ScanSweep />
                  </div>
                </motion.div>
              )}

              {stage === "handshake" && (
                <motion.div
                  key="handshake"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="flex items-center gap-4"
                >
                  <PeerAvatar name="peer" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium text-[var(--kz-mist)]">
                      <span className="text-[var(--kz-coral)]">Peer</span> connected
                      <ConnectingDots />
                    </p>
                    <p className="kz-mono mt-1 text-[11px] text-[var(--kz-smoke)]">
                      exchanging ice candidates · opening the data channel
                    </p>
                  </div>
                </motion.div>
              )}

              {stage === "moving" && (
                <motion.div
                  key="flow"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="w-full"
                >
                  <TransferPanel
                    pct={overall}
                    moved={totalMoved}
                    total={totalBytes}
                    bps={speed}
                    etaMs={etaMs}
                    files={files.map((f) => ({ name: f.name, size: f.size, done: moved[f.id] ?? 0 }))}
                    doneLabel="sent"
                    caption={`${files.length} file${files.length > 1 ? "s" : ""} · ${doneCount} done`}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <button
            onClick={cancelTransfer}
            className="kz-ghost-btn mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-[var(--kz-hairline)] text-[13px]"
          >
            <RotateCcw className="h-4 w-4" /> Cancel transfer
          </button>
        </div>
      )}

      {/* ── ERROR ───────────────────────────────────────────────── */}
      {stage === "error" && (
        <div className="p-5 sm:p-6">
          <div className="kz-inset flex items-start gap-4 px-5 py-5">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,99,99,0.4)] bg-[rgba(255,99,99,0.08)]">
              <TriangleAlert className="h-5 w-5 text-[var(--kz-coral)]" />
            </span>
            <div className="min-w-0">
              <p className="text-[15px] font-medium text-[var(--kz-mist)]">The line dropped</p>
              <p className="kz-mono mt-1 break-words text-[11px] text-[var(--kz-smoke)]">
                {errorReason || "something went wrong mid-flight"}
              </p>
              <p className="kz-mono mt-2 text-[11px] text-[var(--kz-smoke)]">
                nothing was stored anywhere — the bytes died with the line
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={resetAll}
              className="kz-neutral-btn flex h-12 items-center justify-center gap-2 text-sm"
            >
              <Plus className="h-4 w-4" /> New transfer
            </button>
            <button
              onClick={() => void startTransfer()}
              className="kz-cta flex h-12 items-center justify-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </div>
        </div>
      )}

      {/* ── DONE ────────────────────────────────────────────────── */}
      {stage === "done" && summary && (
        <div className="p-5 sm:p-6">
          <div className="kz-inset flex items-center gap-4 px-5 py-5">
            <motion.div
              initial={{ scale: 0.3, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 380, damping: 18 }}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--kz-coral)]"
              aria-hidden="true"
            >
              <Check className="h-6 w-6 text-[#1a0b0b]" strokeWidth={3} />
            </motion.div>
            <div>
              <p className="text-lg font-medium text-[var(--kz-mist)]">Delivered</p>
              <p className="kz-mono mt-1 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                {summary.files} file{summary.files > 1 ? "s" : ""} ·{" "}
                {prettySize(summary.totalBytes)} · {fmtDuration(summary.durationMs)} ·{" "}
                <span className="normal-case text-[var(--kz-ash)]">
                  avg {fmtSpeed(summary.avgBps)}
                </span>
                {" · "}
                {summary.encrypted ? "locked · dtls" : "dtls · direct"}
              </p>
            </div>
          </div>

          <p className="kz-mono mt-4 text-[11px] text-[var(--kz-smoke)]">
            bytes never touched a server in between · the line is closed now
          </p>

          <button
            onClick={resetAll}
            className="kz-neutral-btn mt-5 flex h-12 w-full items-center justify-center gap-2 text-sm"
          >
            <Plus className="h-4 w-4" /> New transfer
          </button>
        </div>
      )}

      {/* ── QR modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {qrOpen && code && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setQrOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="QR code for the room"
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="kz-key w-full max-w-xs p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Scan to join
                </p>
                <button
                  onClick={() => setQrOpen(false)}
                  className="kz-ghost-btn rounded-lg p-1.5"
                  aria-label="Close QR"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 flex justify-center rounded-xl bg-[#0e0f11] p-5 ring-1 ring-white/10">
                <KozaQr value={invite} size={180} />
              </div>
              <p className="kz-mono mt-4 break-all text-center text-xs text-[var(--kz-ash)]">
                box.koza.click/r/<span className="text-[var(--kz-coral)]">{code}</span>
              </p>
              <button
                onClick={() => copy(invite, "Link")}
                className="kz-neutral-btn mt-4 flex h-10 w-full items-center justify-center gap-2 text-[13px]"
              >
                <Check className="h-4 w-4" /> Copy link
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
