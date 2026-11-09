// SPDX-License-Identifier: MPL-2.0
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Link2,
  Plus,
  QrCode,
  RotateCcw,
  Timer,
  UploadCloud,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { KozaQr } from "../koza/QrCode";
import {
  ConnectingDots,
  FileGlyph,
  FingerprintBadge,
  KeepTabNote,
  PeerAvatar,
  PeerSpin,
  ScanSweep,
  TransferPanel,
} from "./visuals";
import { BoxSender, computeTransferFingerprint } from "./webrtc";
import {
  type BoxFile,
  fmtDuration,
  fmtSpeed,
  prettySize,
  shortLinkOf,
  SpeedMeter,
} from "./lib";

type Stage = "collect" | "waiting" | "handshake" | "moving" | "done" | "error";

const SCAN_LINES = [
  "waiting on the signaling line",
  "your invite link is live — send it",
  "the line opens the moment they join",
  "negotiating direct route · 6x parallel stream",
  "listening for a peer",
];

interface StagedItem {
  meta: BoxFile;
  file: File;
}

export function TransferCard() {
  const [staged, setStaged] = useState<StagedItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("collect");
  const [code, setCode] = useState("");
  const [fingerprint, setFingerprint] = useState("");
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
    fingerprint: string;
  } | null>(null);
  const [scanIdx, setScanIdx] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorReason, setErrorReason] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<BoxSender | null>(null);
  const stagedRef = useRef<StagedItem[]>([]);
  const codeRef = useRef("");
  const tokenRef = useRef("");
  const meterRef = useRef<SpeedMeter | null>(null);
  const t0Ref = useRef(0);
  const tick = useRef<number | null>(null);
  const movedRef = useRef<Record<string, number>>({});
  const linkCopiedTimer = useRef<number | null>(null);
  const stageRef = useRef<Stage>("collect");
  const lastUiUpdateRef = useRef(0);

  const files = staged.map((s) => s.meta);

  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

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

  /* native guard — the browser asks before closing the tab mid-transfer */
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
    const incoming: StagedItem[] = Array.from(list).map((f) => ({
      meta: {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name: f.name,
        size: f.size,
        type: f.type || "application/octet-stream",
      },
      file: f,
    }));
    setStaged((prev) => {
      const combined = [...prev, ...incoming].slice(0, 12);
      stagedRef.current = combined;
      return combined;
    });
    if (incoming.length) {
      toast.success(`${incoming.length} file${incoming.length > 1 ? "s" : ""} staged`);
    }
  };

  const removeStagedFile = (id: string) => {
    setStaged((prev) => {
      const next = prev.filter((item) => item.meta.id !== id);
      stagedRef.current = next;
      return next;
    });
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
      /* room expires automatically */
    }
  }, []);

  const stopClock = () => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  };

  const startTransfer = async () => {
    const currentStaged = stagedRef.current;
    if (currentStaged.length === 0) return;
    const pw = password.trim();
    if (pw.length > 0 && pw.length < 4) {
      toast.error("Password is too short", { description: "Use at least 4 characters" });
      return;
    }

    setStage("collect");
    setErrorReason("");
    let created: {
      room?: { code?: string; fingerprint?: string };
      sender_token?: string;
      error?: string;
    } | null = null;
    try {
      const r = await fetch("/api/v1/box/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          files: currentStaged.map((s) => ({ name: s.meta.name, size: s.meta.size })),
          ...(pw ? { password: pw } : {}),
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
    const fp =
      created.room.fingerprint ||
      computeTransferFingerprint(
        c,
        currentStaged.map((s) => ({ name: s.meta.name, size: s.meta.size })),
      );
    codeRef.current = c;
    tokenRef.current = token;
    setCode(c);
    setFingerprint(fp);
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

    t0Ref.current = Date.now();
    lastUiUpdateRef.current = 0;
    stopClock();
    tick.current = window.setInterval(() => {
      setElapsed(Date.now() - t0Ref.current);
      setMoved({ ...movedRef.current });
      const meter = meterRef.current;
      if (meter) {
        setSpeed(meter.bps);
        const total = stagedRef.current.reduce((a, s) => a + s.meta.size, 0);
        const movedBytes = Object.values(movedRef.current).reduce((a, b) => a + b, 0);
        setEta(meter.bps > 0 ? ((total - movedBytes) / meter.bps) * 1000 : 0);
      }
    }, 250);

    const finish = () => {
      if (stageRef.current === "done") return;
      stopClock();
      const activeList = stagedRef.current;
      const total = activeList.reduce((a, s) => a + s.meta.size, 0);
      const durationMs = Math.max(400, Date.now() - t0Ref.current);
      setSummary({
        files: activeList.length,
        totalBytes: total,
        durationMs,
        avgBps: total / (durationMs / 1000),
        encrypted: pw.length > 0,
        fingerprint: fp,
      });
      setStage("done");
      engineRef.current?.dispose();
      engineRef.current = null;
      closeRoom(c, token);
      toast.success("Delivered", { description: "All files reached your peer." });
    };

    const engine = new BoxSender({
      onJoined: () => setStage((s) => (s === "waiting" ? "waiting" : s)),
      onPeerJoined: () => setStage((s) => (s !== "done" ? "handshake" : s)),
      onPeerLeft: () => {
        const st = stageRef.current;
        if (st === "moving" || st === "handshake") {
          const count = stagedRef.current.length;
          if (doneCountRef.current >= count && count > 0) {
            finish();
            return;
          }
          stopClock();
          setErrorReason("the peer disconnected before completion");
          setStage("error");
        }
      },
      onChannelOpen: () => {
        meterRef.current = new SpeedMeter();
        setStage("moving");
        const sender = engineRef.current;
        if (!sender) return;
        const rawFiles = stagedRef.current.map((s) => s.file);
        sender.sendFiles(rawFiles).catch((err) => {
          stopClock();
          setErrorReason(String(err?.message ?? err));
          setStage("error");
        });
      },
      onProgress: (queued) => {
        let remaining = queued;
        const next: Record<string, number> = {};
        for (const s of stagedRef.current) {
          const take = Math.max(0, Math.min(s.meta.size, remaining));
          next[s.meta.id] = take;
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
      onFileQueued: () => {},
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
    setStaged([]);
    stagedRef.current = [];
    setStage("collect");
    setCode("");
    setFingerprint("");
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

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(shortLinkOf(code));
      setLinkCopied(true);
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      linkCopiedTimer.current = window.setTimeout(() => setLinkCopied(false), 1600);
      toast.success("Invite link copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const invite = shortLinkOf(code);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);
  const totalMoved = files.reduce((a, f) => a + (moved[f.id] ?? 0), 0);
  const overall = totalBytes > 0 ? Math.min(100, (totalMoved / totalBytes) * 100) : 0;
  const etaMs = speed > 0 ? ((totalBytes - totalMoved) / speed) * 1000 : 0;

  return (
    <div className="w-full max-w-xl space-y-3" id="transfer">
      {/* Separate shadcn Alert block when in an active room */}
      <AnimatePresence initial={false}>
        {inRoom && (
          <motion.div
            key="keep-tab-alert"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22 }}
          >
            <KeepTabNote
              title="Direct line is active"
              text="stay on this tab — the line closes with it"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="kz-edge w-full overflow-hidden">
        {/* Clean stage header bar — no "direct udp" / "turbo stream" / "locked" clutter */}
        <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
          <div className="flex items-center gap-2">
            <Badge variant={stage === "error" ? "destructive" : stage === "done" ? "emerald" : "coral"}>
              {stage === "collect" && "01 · Stage"}
              {stage === "waiting" && "02 · Waiting"}
              {stage === "handshake" && "02 · Handshake"}
              {stage === "moving" && "03 · Streaming"}
              {stage === "done" && "04 · Delivered"}
              {stage === "error" && "Dropped"}
            </Badge>
            <span className="kz-mono text-[11px] text-[var(--kz-ash)]">
              {stage === "collect" && (files.length > 0 ? `${files.length}/12 files · ${prettySize(totalBytes)}` : "up to 12 files")}
              {stage === "waiting" && "awaiting receiver"}
              {stage === "handshake" && "connecting to peer"}
              {stage === "moving" && "transferring files"}
              {stage === "done" && "transfer complete"}
              {stage === "error" && "connection interrupted"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {inRoom && fingerprint && <FingerprintBadge fingerprint={fingerprint} />}
            {inRoom && (
              <Badge variant="secondary">
                <Timer className="h-3 w-3" />
                {fmtDuration(elapsed)}
              </Badge>
            )}
          </div>
        </div>

        {/* ── COLLECT / READY ─────────────────────────────────────── */}
        {stage === "collect" && (
          <div className="p-5 sm:p-6">
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
              className={`kz-inset group relative flex cursor-pointer flex-col items-center justify-center border border-dashed border-[var(--kz-hairline-strong)] px-6 py-9 text-center transition-all duration-150 ${
                dragging
                  ? "!border-[var(--kz-coral)] bg-[rgba(255,99,99,0.08)]"
                  : "hover:border-white/25 hover:bg-white/[0.04]"
              }`}
            >
              <div
                className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04] transition-transform duration-150 group-hover:scale-105 ${
                  dragging ? "scale-110 border-[var(--kz-coral)]/40" : ""
                }`}
                aria-hidden="true"
              >
                <UploadCloud className="h-5 w-5 text-[var(--kz-coral)]" />
              </div>
              <p className="text-[16px] font-medium text-[var(--kz-mist)]">
                Drop files here or click to browse
              </p>
              <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
                any file type · streams directly from your browser
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

            {/* Staged files list */}
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
                        <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">
                          {f.name}
                        </p>
                        <p className="kz-mono mt-0.5 text-[11px] text-[var(--kz-smoke)]">
                          {prettySize(f.size)}
                        </p>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeStagedFile(f.id);
                        }}
                        className="kz-ghost-btn shrink-0 cursor-pointer rounded-lg p-1.5"
                        aria-label={`Remove ${f.name}`}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            )}

            {/* Password + Open Line CTA */}
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
                    placeholder="optional room password (min 4 chars)"
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
                  className="kz-cta flex h-12 w-full cursor-pointer items-center justify-center gap-2 text-sm"
                >
                  <Zap className="h-4 w-4" />
                  Open direct line
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>
            )}
          </div>
        )}

        {/* ── ROOM (waiting / handshake / moving) ─────────────────── */}
        {inRoom && (
          <div className="p-5 sm:p-6">
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
                  <div className="kz-inset px-4 py-6">
                    <button
                      onClick={copyInvite}
                      className="group flex w-full cursor-pointer flex-col items-center text-center"
                      title="Tap to copy invite link"
                      aria-label="Copy invite link"
                    >
                      <Badge variant={linkCopied ? "emerald" : "secondary"}>
                        {linkCopied ? (
                          <Check className="h-3 w-3 text-emerald-400" strokeWidth={2.5} />
                        ) : (
                          <Link2 className="h-3 w-3" />
                        )}
                        {linkCopied ? "copied — send to your peer" : "share this room code"}
                      </Badge>
                      <p className="kz-mono mt-3.5 text-[34px] font-semibold leading-none tracking-[0.2em] text-[var(--kz-mist)] transition-colors group-hover:text-[var(--kz-coral)]">
                        {code}
                      </p>
                      <p className="kz-mono mt-2.5 text-[12px] text-[var(--kz-ash)]">
                        box.koza.click/r/<span className="text-[var(--kz-coral)]">{code}</span>
                      </p>
                    </button>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        onClick={copyInvite}
                        className="kz-cta flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-4 text-[12px]"
                      >
                        {linkCopied ? (
                          <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                        {linkCopied ? "Copied" : "Copy link"}
                      </button>
                      <button
                        onClick={() => setQrOpen(true)}
                        className="kz-neutral-btn flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-[12px]"
                      >
                        <QrCode className="h-3.5 w-3.5" /> QR Code
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-5 flex flex-col items-center text-center">
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
                        Waiting for receiver to join
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
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-[14px] font-medium text-[var(--kz-mist)]">
                        <span className="text-[var(--kz-coral)]">Receiver</span> connected
                        <ConnectingDots />
                      </p>
                      <p className="kz-mono mt-1 text-[11px] text-[var(--kz-smoke)]">
                        verifying fingerprint · opening parallel data lanes
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
                    className="w-full text-left"
                  >
                    <TransferPanel
                      pct={overall}
                      moved={totalMoved}
                      total={totalBytes}
                      bps={speed}
                      etaMs={etaMs}
                      files={files.map((f) => ({
                        name: f.name,
                        size: f.size,
                        done: moved[f.id] ?? 0,
                      }))}
                      doneLabel="sent"
                      caption={`${doneCount}/${files.length} sent`}
                      fingerprint={fingerprint}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              onClick={cancelTransfer}
              className="kz-ghost-btn mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--kz-hairline)] text-[13px]"
            >
              <RotateCcw className="h-4 w-4" /> Cancel transfer
            </button>
          </div>
        )}

        {/* ── ERROR (clean shadcn Alert) ──────────────────────────── */}
        {stage === "error" && (
          <div className="p-5 sm:p-6">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Connection interrupted — the line dropped</AlertTitle>
              <AlertDescription className="space-y-1.5 pt-1">
                <p className="kz-mono text-xs text-red-200/90">
                  {errorReason || "the connection closed before the transfer finished"}
                </p>
                <p className="kz-mono text-[11px] text-red-200/60">
                  Zero bytes were stored on any server. Reopen the line to try again.
                </p>
              </AlertDescription>
            </Alert>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                onClick={resetAll}
                className="kz-neutral-btn flex h-11 cursor-pointer items-center justify-center gap-2 text-sm"
              >
                <Plus className="h-4 w-4" /> New transfer
              </button>
              <button
                onClick={() => void startTransfer()}
                className="kz-cta flex h-11 cursor-pointer items-center justify-center gap-2 text-sm"
              >
                <RotateCcw className="h-4 w-4" /> Reopen line
              </button>
            </div>
          </div>
        )}

        {/* ── DONE ────────────────────────────────────────────────── */}
        {stage === "done" && summary && (
          <div className="p-5 sm:p-6">
            <Alert variant="emerald">
              <Check className="h-4 w-4" />
              <AlertTitle className="flex flex-wrap items-center justify-between gap-2">
                <span>Transfer delivered</span>
                {summary.fingerprint && <FingerprintBadge fingerprint={summary.fingerprint} />}
              </AlertTitle>
              <AlertDescription className="kz-mono pt-1 text-xs">
                {summary.files} file{summary.files > 1 ? "s" : ""} ·{" "}
                {prettySize(summary.totalBytes)} in {fmtDuration(summary.durationMs)} · avg{" "}
                {fmtSpeed(summary.avgBps)}
              </AlertDescription>
            </Alert>

            <button
              onClick={resetAll}
              className="kz-neutral-btn mt-4 flex h-11 w-full cursor-pointer items-center justify-center gap-2 text-sm"
            >
              <Plus className="h-4 w-4" /> Send more files
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
                  <Badge variant="secondary">Scan to receive</Badge>
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
                  className="kz-neutral-btn mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 text-[13px]"
                >
                  <Copy className="h-4 w-4" /> Copy link
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
