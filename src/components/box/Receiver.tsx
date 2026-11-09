// SPDX-License-Identifier: MPL-2.0
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Download,
  KeyRound,
  Lock,
  RotateCcw,
  Timer,
  TriangleAlert,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { BoxFooter, BoxNav } from "./Sections";
import {
  FileGlyph,
  FingerprintHover,
  KeepTabNote,
  PeerSpin,
  TransferPanel,
} from "./visuals";
import { wipeTo } from "../wipe";
import { BoxReceiver, computeTransferFingerprint, saveBlob } from "./webrtc";
import {
  fmtDuration,
  fmtSpeed,
  prettySize,
  SpeedMeter,
} from "./lib";

type Stage = "linking" | "not-found" | "offer" | "receiving" | "done" | "error";

interface RoomOffer {
  files: { name: string; size: number }[];
  password: boolean;
  fingerprint: string;
  createdAt: number;
}

interface ReceivedFile {
  index: number;
  name: string;
  size: number;
  type: string;
  blob: Blob;
}

export function Receiver({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>("linking");
  const [offer, setOffer] = useState<RoomOffer | null>(null);
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(false);
  const [movedByIdx, setMovedByIdx] = useState<Record<number, number>>({});
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [receivedFor, setReceivedFor] = useState(0);
  const [errorReason, setErrorReason] = useState("");
  const [received, setReceived] = useState<ReceivedFile[]>([]);

  const engineRef = useRef<BoxReceiver | null>(null);
  const meterRef = useRef<SpeedMeter | null>(null);
  const receivedRef = useRef<ReceivedFile[]>([]);
  const movedRef = useRef<Record<number, number>>({});
  const t0 = useRef(0);
  const tick = useRef<number | null>(null);
  const stageRef = useRef<Stage>("linking");
  const lastProgressUiRef = useRef(0);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  useEffect(
    () => () => {
      if (tick.current !== null) window.clearInterval(tick.current);
      engineRef.current?.dispose();
    },
    [],
  );

  /* Native guard while receiving */
  useEffect(() => {
    if (stage !== "receiving") return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [stage]);

  /* Fetch the live room from the backend */
  const probeRoom = useCallback(() => {
    setStage("linking");
    setErrorReason("");
    let alive = true;
    fetch(`/api/v1/box/rooms/${encodeURIComponent(code.toUpperCase())}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) return null;
        return r.json();
      })
      .then(
        (
          data: {
            room?: {
              code?: string;
              files?: { name: string; size: number }[];
              password?: boolean;
              fingerprint?: string;
              created_at?: string;
            };
          } | null,
        ) => {
          if (!alive) return;
          if (!data?.room) {
            setStage("not-found");
            return;
          }
          const files = Array.isArray(data.room.files) ? data.room.files : [];
          const hasPw = Boolean(data.room.password);
          const fp =
            data.room.fingerprint ||
            computeTransferFingerprint(code.toUpperCase(), files);
          setOffer({
            files,
            password: hasPw,
            fingerprint: fp,
            createdAt: Date.parse(data.room.created_at ?? "") || Date.now(),
          });
          setStage("offer");
        },
      )
      .catch(() => {
        if (alive) setStage("not-found");
      });
    return () => {
      alive = false;
    };
  }, [code]);

  useEffect(() => {
    return probeRoom();
  }, [probeRoom]);

  const totalBytes = offer?.files.reduce((a, f) => a + f.size, 0) ?? 0;
  const totalMoved =
    offer?.files.reduce((a, _f, idx) => a + (movedByIdx[idx] ?? 0), 0) ?? 0;
  const overall = totalBytes > 0 ? Math.min(100, (totalMoved / totalBytes) * 100) : 0;
  const needsPw = Boolean(offer?.password);
  const doneCount = received.length;

  const stopClock = () => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  };

  /* Join the real transfer room */
  const startReceive = useCallback(
    (password: string) => {
      if (!offer) return;
      setPwWrong(false);
      setStage("receiving");
      t0.current = Date.now();
      lastProgressUiRef.current = 0;
      movedRef.current = {};
      setMovedByIdx({});
      receivedRef.current = [];
      setReceived([]);
      meterRef.current = new SpeedMeter();

      tick.current = window.setInterval(() => {
        setReceivedFor(Date.now() - t0.current);
        setMovedByIdx({ ...movedRef.current });
        const meter = meterRef.current;
        if (meter) {
          const movedBytes = offer.files.reduce(
            (a, _f, idx) => a + (movedRef.current[idx] ?? 0),
            0,
          );
          setSpeed(meter.bps);
          setEta(meter.bps > 0 ? ((totalBytes - movedBytes) / meter.bps) * 1000 : 0);
        }
      }, 250);

      const engine = new BoxReceiver({
        onJoined: () => {},
        onPeerLeft: () => {
          if (stageRef.current === "receiving") {
            if (receivedRef.current.length >= offer.files.length && offer.files.length > 0) {
              stopClock();
              setStage("done");
              return;
            }
            stopClock();
            setErrorReason("the sender dropped — the line closed");
            setStage("error");
          }
        },
        onChannelOpen: () => {
          t0.current = Date.now();
        },
        onFileStart: (index) => {
          movedRef.current = { ...movedRef.current, [index]: movedRef.current[index] ?? 0 };
          setMovedByIdx({ ...movedRef.current });
        },
        onProgress: (index, bytes) => {
          movedRef.current = { ...movedRef.current, [index]: bytes };
          const total = Object.values(movedRef.current).reduce((a, b) => a + b, 0);
          meterRef.current?.push(total);
          const now = Date.now();
          if (now - lastProgressUiRef.current >= 100) {
            lastProgressUiRef.current = now;
            setMovedByIdx({ ...movedRef.current });
          }
        },
        onFileDone: (index, file) => {
          const record: ReceivedFile = {
            index,
            name: file.name,
            size: file.size,
            type: file.type,
            blob: file.blob,
          };
          receivedRef.current = [...receivedRef.current, record];
          setReceived([...receivedRef.current]);
          movedRef.current = { ...movedRef.current, [index]: file.size };
          setMovedByIdx({ ...movedRef.current });
          saveBlob(file.blob, file.name);
        },
        onAllDone: () => {
          stopClock();
          setReceivedFor(Math.max(400, Date.now() - t0.current));
          setMovedByIdx({ ...movedRef.current });
          setStage("done");
          const eng = engineRef.current;
          engineRef.current = null;
          if (eng) window.setTimeout(() => eng.dispose(), 600);
          toast.success("Delivered", {
            description: "The files have been saved to your device.",
          });
        },
        onError: (reason) => {
          if (stageRef.current === "done") return;
          if (reason === "wrong-password") {
            stopClock();
            setStage("offer");
            setPwWrong(true);
            return;
          }
          stopClock();
          setErrorReason(reason);
          setStage("error");
        },
      });

      engineRef.current = engine;
      engine.connect(code.toUpperCase(), password).catch(() => {
        stopClock();
        setErrorReason("could not reach the signaling line");
        setStage("error");
      });
    },
    [code, offer, totalBytes],
  );

  const downloadReceipt = () => {
    if (!offer) return;
    const lines = [
      "koza box · transfer receipt",
      `room: ${code.toUpperCase()}`,
      `fingerprint: ${offer.fingerprint}`,
      `received: ${offer.files.length} file(s) · ${prettySize(totalBytes)} in ${Math.max(1, Math.round(receivedFor / 1000))}s`,
      "",
      ...offer.files.map((f) => `  ${f.name} — ${prettySize(f.size)}`),
      "",
      "bytes travelled peer-to-peer · nothing was stored in between",
    ];
    saveBlob(
      new Blob([lines.join("\n")], { type: "text/plain" }),
      `koza-box-${code.toUpperCase()}.txt`,
    );
    toast.success("Receipt saved");
  };

  const etaMs = speed > 0 ? ((totalBytes - totalMoved) / speed) * 1000 : 0;

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{
          style: {
            background: "rgba(17,18,20,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e6e6e6",
            borderRadius: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          },
        }}
      />
      <BoxNav />

      <main className="flex flex-1 flex-col items-center px-4 pt-[13vh] pb-12 sm:pt-[17vh]">
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          {stage === "receiving" ? (
            <>
              Receiving{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                files
              </span>
              .
            </>
          ) : stage === "done" ? (
            <>
              Transfer{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                complete
              </span>
              .
            </>
          ) : stage === "not-found" || stage === "error" ? (
            <>
              Line{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                closed
              </span>
              .
            </>
          ) : (
            <>
              Ready to{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                receive
              </span>
              .
            </>
          )}
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="kz-edge mt-7 w-full max-w-xl overflow-hidden"
        >
          {/* Stage strip — plain mono text, no noisy pill badges */}
          <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
            <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
              {stage === "linking" && "01 · opening line"}
              {stage === "offer" && "02 · incoming files"}
              {stage === "receiving" && "03 · receiving"}
              {stage === "done" && "04 · delivered"}
              {stage === "not-found" && "line closed"}
              {stage === "error" && "line trouble"}
            </span>

            <span className="flex items-center gap-3">
              {stage === "offer" && offer && (
                <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                  {offer.files.length} file{offer.files.length > 1 ? "s" : ""} ·{" "}
                  {prettySize(totalBytes)}
                </span>
              )}
              {needsPw && stage === "offer" && (
                <span className="kz-mono flex items-center gap-1 text-[11px] text-[var(--kz-coral)]">
                  <Lock className="h-3 w-3" /> locked
                </span>
              )}
              {offer?.fingerprint && (stage === "offer" || stage === "receiving") && (
                <FingerprintHover fingerprint={offer.fingerprint} />
              )}
              {stage === "receiving" && (
                <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-smoke)]">
                  <Timer className="h-3.5 w-3.5" />
                  {fmtDuration(receivedFor)}
                </span>
              )}
            </span>
          </div>

          <div className="p-5 sm:p-6">
            <AnimatePresence mode="wait" initial={false}>
              {/* ── LINKING (Shadcn Skeleton + spinner) ──────────── */}
              {stage === "linking" && (
                <motion.div
                  key="linking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.24 }}
                  className="space-y-3"
                >
                  <div className="kz-inset flex items-center gap-3 px-3.5 py-3">
                    <Skeleton className="h-9 w-9 shrink-0 rounded-lg bg-white/[0.06]" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-2/3 rounded-md bg-white/[0.06]" />
                      <Skeleton className="h-2.5 w-24 rounded-md bg-white/[0.04]" />
                    </div>
                  </div>
                  <Skeleton className="h-12 w-full rounded-xl bg-white/[0.05]" />
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <PeerSpin size={13} />
                    <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                      connecting to room {code.toUpperCase()}…
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ── NOT FOUND ───────────────────────────────────── */}
              {stage === "not-found" && (
                <motion.div
                  key="not-found"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                >
                  <div className="kz-inset flex items-start gap-4 px-5 py-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,99,99,0.4)] bg-[rgba(255,99,99,0.08)]">
                      <TriangleAlert className="h-5 w-5 text-[var(--kz-coral)]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-[var(--kz-mist)]">
                        This line is closed or expired
                      </p>
                      <p className="kz-mono mt-1 text-[11px] text-[var(--kz-smoke)]">
                        room {code.toUpperCase()} is no longer active
                      </p>
                      <p className="kz-mono mt-2 text-[11px] text-[var(--kz-smoke)]">
                        direct lines only stay open while the sender keeps their tab open
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={() => probeRoom()}
                      className="kz-neutral-btn flex h-12 cursor-pointer items-center justify-center gap-2 text-sm"
                    >
                      <RotateCcw className="h-4 w-4" /> Try again
                    </button>
                    <button
                      onClick={() => wipeTo("/box")}
                      className="kz-ghost-btn flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--kz-hairline)] text-sm"
                    >
                      Open box <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── OFFER (Clean file list + unified action bar) ── */}
              {stage === "offer" && offer && (
                <motion.div
                  key="offer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                >
                  <ul
                    className="kz-inset divide-y divide-[var(--kz-hairline)]"
                    aria-label="Incoming files"
                  >
                    {offer.files.map((f, i) => (
                      <li
                        key={`${f.name}-${i}`}
                        className="flex items-center gap-3 px-3.5 py-3"
                      >
                        <FileGlyph name={f.name} />
                        <p className="kz-mono min-w-0 flex-1 truncate text-[13px] text-[var(--kz-mist)]">
                          {f.name}
                        </p>
                        <p className="kz-mono shrink-0 text-[11.5px] text-[var(--kz-smoke)]">
                          {prettySize(f.size)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {needsPw ? (
                    <motion.div
                      animate={pwWrong ? { x: [0, -8, 8, -6, 6, -2, 0] } : { x: 0 }}
                      transition={{ duration: 0.42 }}
                      className="mt-4"
                    >
                      {/* Unified password + download bar */}
                      <div
                        className="kz-inset flex items-center gap-2 p-1.5 pl-3.5"
                        style={
                          pwWrong
                            ? {
                                boxShadow:
                                  "inset 0 0 0 1px rgba(255,99,99,0.7), inset 0 1px 2px rgba(0,0,0,0.35)",
                              }
                            : undefined
                        }
                      >
                        <KeyRound className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
                        <input
                          value={pw}
                          onChange={(e) => {
                            setPw(e.target.value);
                            setPwWrong(false);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && pw.trim()) startReceive(pw);
                          }}
                          type="password"
                          placeholder="Enter password…"
                          aria-label="Room password"
                          autoFocus
                          autoComplete="off"
                          className="kz-mono h-9 w-full min-w-0 flex-1 bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                        />
                        {pw && (
                          <button
                            onClick={() => setPw("")}
                            className="kz-ghost-btn shrink-0 rounded-md p-1"
                            aria-label="Clear password"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => startReceive(pw)}
                          disabled={pw.trim().length === 0}
                          className="kz-cta flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download
                        </button>
                      </div>
                      {pwWrong && (
                        <p className="kz-mono mt-2 px-1 text-[11px] text-[var(--kz-coral)]">
                          wrong password — try again
                        </p>
                      )}
                    </motion.div>
                  ) : (
                    <button
                      onClick={() => startReceive("")}
                      className="kz-cta mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 text-sm"
                    >
                      <Download className="h-4 w-4" />
                      Download {offer.files.length > 1 ? "files" : "file"}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  )}
                </motion.div>
              )}

              {/* ── RECEIVING ───────────────────────────────────── */}
              {stage === "receiving" && offer && (
                <motion.div
                  key="receiving"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                >
                  <TransferPanel
                    pct={overall}
                    moved={totalMoved}
                    total={totalBytes}
                    bps={speed}
                    etaMs={etaMs}
                    files={offer.files.map((f, idx) => ({
                      name: f.name,
                      size: f.size,
                      done: movedByIdx[idx] ?? 0,
                    }))}
                    doneLabel="received"
                    caption={`${offer.files.length} file${offer.files.length > 1 ? "s" : ""} · ${doneCount} saved`}
                  />
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--kz-hairline)] pt-3">
                    <KeepTabNote text="stay on this tab — the line closes with it" />
                    <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                      direct stream
                    </span>
                  </div>
                </motion.div>
              )}

              {/* ── ERROR ───────────────────────────────────────── */}
              {stage === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.26 }}
                >
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
                        ask the sender to reopen the line — nothing was stored anywhere
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => probeRoom()}
                    className="kz-neutral-btn mt-4 flex h-12 w-full cursor-pointer items-center justify-center gap-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" /> Try the line again
                  </button>
                </motion.div>
              )}

              {/* ── DONE (Original clean Delivered layout) ──────── */}
              {stage === "done" && offer && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
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
                      <p className="kz-mono mt-0.5 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                        {offer.files.length} file{offer.files.length > 1 ? "s" : ""} ·{" "}
                        {prettySize(totalBytes)} · {Math.max(1, Math.round(receivedFor / 1000))}s ·{" "}
                        {fmtSpeed(totalBytes / Math.max(0.4, receivedFor / 1000))}
                      </p>
                    </div>
                  </div>

                  {received.length > 0 && (
                    <ul className="kz-inset mt-3 divide-y divide-[var(--kz-hairline)]">
                      {received.map((f) => (
                        <li
                          key={`${f.index}-${f.name}`}
                          className="flex items-center gap-3 px-3.5 py-2.5"
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
                            onClick={() => saveBlob(f.blob, f.name)}
                            className="kz-ghost-btn shrink-0 cursor-pointer self-center rounded-lg p-2"
                            aria-label={`Save ${f.name} again`}
                            title="Save again"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={downloadReceipt}
                      className="kz-neutral-btn flex h-12 cursor-pointer items-center justify-center gap-2 text-sm"
                    >
                      <Download className="h-4 w-4" /> Save receipt
                    </button>
                    <button
                      onClick={() => wipeTo("/box")}
                      className="kz-ghost-btn flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--kz-hairline)] text-sm"
                    >
                      Open box <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </main>

      <BoxFooter />
    </div>
  );
}
