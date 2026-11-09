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
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { BoxFooter, BoxNav } from "./Sections";
import {
  KeepTabNote,
  PeerAvatar,
  PeerSpin,
  ScanSweep,
  TransferPanel,
} from "./visuals";
import { wipeTo } from "../wipe";
import { BoxReceiver, saveBlob } from "./webrtc";
import {
  type TransferOffer,
  fmtDuration,
  fmtSpeed,
  loadOffer,
  pickPeer,
  prettySize,
  SpeedMeter,
} from "./lib";

type Stage = "linking" | "offer" | "receiving" | "done" | "error";

interface ReceivedFile {
  name: string;
  size: number;
  type: string;
  blob: Blob;
}

/* sample payload when the code has no live offer (cold open / other browser) */
function demoOffer(): TransferOffer {
  return {
    files: [
      { name: "field-notes.pdf", size: 812_440 },
      { name: "loop-take-02.wav", size: 2_731_860 },
      { name: "cover-art.png", size: 1_284_112 },
    ],
    passwordHash: null,
    encrypted: true,
    createdAt: Date.now(),
  };
}

export function Receiver({ code }: { code: string }) {
  const [stage, setStage] = useState<Stage>("linking");
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(false);
  const [moved, setMoved] = useState<Record<string, number>>({});
  const [speed, setSpeed] = useState(0);
  const [eta, setEta] = useState(0);
  const [receivedFor, setReceivedFor] = useState(0);
  const [errorReason, setErrorReason] = useState("");
  const [received, setReceived] = useState<ReceivedFile[]>([]);

  /* resolved once, on the client, before the first offer screen shows */
  const [boot] = useState(() => {
    if (typeof window === "undefined") {
      return { offer: demoOffer(), isDemo: true, peer: { name: "", device: "" } };
    }
    const live = loadOffer(code);
    return { offer: live ?? demoOffer(), isDemo: !live, peer: pickPeer() };
  });
  const peer = boot.peer;

  /* no local offer → ask the koza api for the live room */
  const [offer, setOffer] = useState(boot.offer);
  const [isDemo, setIsDemo] = useState(boot.isDemo);
  useEffect(() => {
    if (!boot.isDemo) return;
    let alive = true;
    fetch(`/api/v1/box/rooms/${encodeURIComponent(code)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            room?: {
              files?: { name: string; size: number }[];
              password?: boolean;
              password_hash?: string | null;
              created_at?: string;
            };
          } | null,
        ) => {
          if (!alive || !data?.room?.files?.length) return;
          const hasPw = Boolean(data.room.password || data.room.password_hash);
          setOffer({
            files: data.room.files,
            passwordHash: data.room.password_hash ?? (hasPw ? "locked" : null),
            encrypted: hasPw,
            createdAt: Date.parse(data.room.created_at ?? "") || Date.now(),
          });
          setIsDemo(false);
        },
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [boot.isDemo, code]);

  const engineRef = useRef<BoxReceiver | null>(null);
  const meterRef = useRef<SpeedMeter | null>(null);
  const receivedRef = useRef<ReceivedFile[]>([]);
  const movedRef = useRef<Record<string, number>>({});
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

  /* the linking beat, then the offer screen */
  useEffect(() => {
    const t = window.setTimeout(() => setStage((s) => (s === "linking" ? "offer" : s)), 1500);
    return () => window.clearTimeout(t);
  }, [code]);

  const totalBytes = offer?.files.reduce((a, f) => a + f.size, 0) ?? 0;
  const totalMoved = offer?.files.reduce((a, f) => a + (moved[f.name] ?? 0), 0) ?? 0;
  const overall = totalBytes > 0 ? Math.min(100, (totalMoved / totalBytes) * 100) : 0;
  const needsPw = Boolean(offer?.passwordHash || offer?.encrypted);
  const doneCount = isDemo
    ? (offer?.files.filter((f) => (moved[f.name] ?? 0) >= f.size).length ?? 0)
    : received.length;

  const stopClock = () => {
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  };

  /* ── demo path: the old simulated receive, kept for cold opens ── */
  const startDemo = useCallback(() => {
    if (!offer) return;
    setStage("receiving");
    t0.current = Date.now();
    meterRef.current = new SpeedMeter();
    const rates = new Map<string, number>();
    offer.files.forEach((f) => rates.set(f.name, (2.4 + Math.random() * 4.2) * 1024 * 1024));
    const prev: Record<string, number> = {};
    let movedTotal = 0;
    tick.current = window.setInterval(() => {
      setReceivedFor(Date.now() - t0.current);
      const next = { ...prev };
      let allDone = true;
      for (const f of offer.files) {
        const done = next[f.name] ?? 0;
        if (done >= f.size) continue;
        allDone = false;
        const step = (rates.get(f.name) ?? 1024 * 1024) * 0.16;
        next[f.name] = Math.min(f.size, done + step * (0.7 + Math.random() * 0.6));
      }
      movedTotal = offer.files.reduce((a, f) => a + (next[f.name] ?? 0), 0);
      Object.assign(prev, next);
      setMoved({ ...next });
      setSpeed(meterRef.current?.push(movedTotal) ?? 0);
      if (allDone && tick.current !== null) {
        window.clearInterval(tick.current);
        tick.current = null;
        window.setTimeout(() => setStage("done"), 450);
      }
    }, 120);
  }, [offer]);

  /* ── real path: join the line, webrtc does the rest ───────────── */
  const startReal = useCallback(
    (password: string) => {
      if (!offer) return;
      setPwWrong(false);
      setStage("receiving");
      t0.current = Date.now();
      lastProgressUiRef.current = 0;
      movedRef.current = {};
      setMoved({});
      receivedRef.current = [];
      setReceived([]);
      meterRef.current = new SpeedMeter();

      tick.current = window.setInterval(() => {
        setReceivedFor(Date.now() - t0.current);
        setMoved({ ...movedRef.current });
        const meter = meterRef.current;
        if (meter) {
          const movedBytes = offer.files.reduce((a, f) => a + (movedRef.current[f.name] ?? 0), 0);
          setSpeed(meter.bps);
          setEta(meter.bps > 0 ? ((totalBytes - movedBytes) / meter.bps) * 1000 : 0);
        }
      }, 250);

      const engine = new BoxReceiver({
        onJoined: () => {
          /* waiting for the sender to push the webrtc offer */
        },
        onPeerLeft: () => {
          if (stageRef.current === "receiving") {
            stopClock();
            setErrorReason("the sender dropped — the line closed");
            setStage("error");
          }
        },
        onChannelOpen: () => {
          /* the sender starts pushing the moment the channel opens */
        },
        onFileStart: (index, meta) => {
          const fileName = offer.files[index]?.name ?? meta.name;
          movedRef.current = { ...movedRef.current, [fileName]: 0 };
          setMoved({ ...movedRef.current });
        },
        onProgress: (index, bytes) => {
          const name = offer.files[index]?.name ?? `file-${index}`;
          movedRef.current = { ...movedRef.current, [name]: bytes };
          const total = Object.values(movedRef.current).reduce((a, b) => a + b, 0);
          meterRef.current?.push(total);
          const now = Date.now();
          if (now - lastProgressUiRef.current >= 100) {
            lastProgressUiRef.current = now;
            setMoved({ ...movedRef.current });
          }
        },
        onFileDone: (index, file) => {
          const record: ReceivedFile = { name: file.name, size: file.size, type: file.type, blob: file.blob };
          receivedRef.current = [...receivedRef.current, record];
          setReceived([...receivedRef.current]);
          movedRef.current = { ...movedRef.current, [file.name]: file.size };
          setMoved({ ...movedRef.current });
          saveBlob(file.blob, file.name);
        },
        onAllDone: () => {
          stopClock();
          setMoved({ ...movedRef.current });
          setStage("done");
          /* the all-done ack for the sender is still in flight — give the
             socket a beat to flush before tearing it down, otherwise the
             frame dies with the close and the sender never completes */
          const eng = engineRef.current;
          engineRef.current = null;
          if (eng) window.setTimeout(() => eng.dispose(), 600);
          toast.success("Delivered", { description: "The files have been saved to your device." });
        },
        onError: (reason) => {
          if (stageRef.current === "done") return;
          if (reason === "wrong-password") {
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
      engine.connect(code, password).catch(() => {
        stopClock();
        setErrorReason("could not reach the signaling line");
        setStage("error");
      });
    },
    [code, offer, totalBytes],
  );

  useEffect(() => () => engineRef.current?.dispose(), []);

  const tryUnlockAndReceive = () => {
    if (!offer) return;
    if (isDemo) {
      /* demo mode validates the tiny digest locally, like before */
      if (hashPassLocal(pw) === offer.passwordHash) {
        setPwWrong(false);
        startDemo();
      } else {
        setPwWrong(true);
      }
      return;
    }
    startReal(pw);
  };

  const downloadReceipt = () => {
    if (!offer) return;
    const lines = [
      "koza box · transfer receipt",
      `line: box.koza.click/r/${code}`,
      `peer: ${peer.name || "sender"} (${peer.device})`,
      `received: ${offer.files.length} file(s) · ${prettySize(totalBytes)} in ${Math.max(1, Math.round(receivedFor / 1000))}s`,
      `encrypted: ${offer.passwordHash ? "password · dtls" : "dtls · direct"}`,
      "",
      ...offer.files.map((f) => `  ${f.name} — ${prettySize(f.size)}`),
      "",
      "bytes travelled peer-to-peer · nothing was stored in between",
    ];
    saveBlob(new Blob([lines.join("\n")], { type: "text/plain" }), `koza-box-${code}.txt`);
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

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <p className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
          incoming direct line · box.koza.click/r/
          <span className="normal-case tracking-[0.08em] text-[var(--kz-coral)]">{code}</span>
        </p>

        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="kz-edge mt-4 w-full max-w-xl"
        >
          {/* stage strip */}
          <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
            <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
              {stage === "linking" && "01 · opening the line"}
              {stage === "offer" && "02 · incoming offer"}
              {stage === "receiving" && "03 · receiving"}
              {stage === "done" && "04 · delivered"}
              {stage === "error" && "line trouble"}
            </span>
            <span className="flex items-center gap-3">
              {needsPw && stage !== "done" && (
                <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-coral)]">
                  <Lock className="h-3.5 w-3.5" /> locked
                </span>
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
              {/* ── LINKING ─────────────────────────────────────── */}
              {stage === "linking" && (
                <motion.div
                  key="linking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                  className="flex flex-col items-center py-2 text-center"
                >
                  <div className="flex items-center gap-2.5">
                    <PeerSpin />
                    <p className="text-[14px] font-medium text-[var(--kz-mist)]">
                      Opening the direct line
                    </p>
                  </div>
                  <p className="kz-mono mt-2 text-[11px] text-[var(--kz-smoke)]">
                    handshake · punch-through · key exchange
                  </p>
                  <div className="mt-4">
                    <ScanSweep />
                  </div>
                </motion.div>
              )}

              {/* ── OFFER ───────────────────────────────────────── */}
              {stage === "offer" && offer && peer && (
                <motion.div
                  key="offer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.28 }}
                >
                  <div className="flex items-center gap-4">
                    <PeerAvatar name={peer.name || "peer"} size={48} />
                    <div className="min-w-0">
                      <p className="text-[15px] font-medium text-[var(--kz-mist)]">
                        <span className="text-[var(--kz-coral)]">{peer.name || "someone"}</span> wants
                        to send you {offer.files.length} file{offer.files.length > 1 ? "s" : ""}
                      </p>
                      <p className="kz-mono mt-0.5 text-[11px] text-[var(--kz-smoke)]">
                        {prettySize(totalBytes)} · {peer.device}
                        {offer.encrypted && (
                          <span className="ml-1.5 inline-flex items-center gap-1 text-[var(--kz-ash)]">
                            <ShieldCheck className="inline h-3 w-3 text-[var(--kz-coral)]" />
                            e2e
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <ul className="kz-inset mt-4 divide-y divide-[var(--kz-hairline)]" aria-label="Incoming files">
                    {offer.files.map((f, i) => (
                      <li key={`${f.name}-${i}`} className="flex items-baseline gap-3 px-3.5 py-2.5">
                        <p className="kz-mono min-w-0 flex-1 truncate text-[13px] text-[var(--kz-mist)]">
                          {f.name}
                        </p>
                        <p className="kz-mono shrink-0 text-[11px] text-[var(--kz-smoke)]">
                          {prettySize(f.size)}
                        </p>
                      </li>
                    ))}
                  </ul>

                  {isDemo && (
                    <p className="kz-mono mt-2.5 text-[10.5px] text-[var(--kz-smoke)]">
                      no live offer on this code — playing a sample payload
                    </p>
                  )}

                  {needsPw ? (
                    <motion.div
                      animate={pwWrong ? { x: [0, -8, 8, -6, 6, -2, 0] } : { x: 0 }}
                      transition={{ duration: 0.42 }}
                      className="mt-4"
                    >
                      <div
                        className="kz-inset flex items-center gap-2.5 px-3.5 py-3"
                        style={
                          pwWrong
                            ? { boxShadow: "inset 0 0 0 1px rgba(255,99,99,0.7), inset 0 1px 2px rgba(0,0,0,0.35)" }
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
                            if (e.key === "Enter" && pw.trim()) tryUnlockAndReceive();
                          }}
                          type="password"
                          placeholder="this line is locked — enter the password"
                          aria-label="Line password"
                          autoFocus
                          autoComplete="off"
                          className="kz-mono w-full min-w-0 bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
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
                      </div>
                      {pwWrong && (
                        <p className="kz-mono mt-2 text-[11px] text-[var(--kz-coral)]">
                          wrong password — ask {peer.name || "the sender"} and try again
                        </p>
                      )}
                      <button
                        onClick={tryUnlockAndReceive}
                        disabled={pw.trim().length === 0}
                        className="kz-cta mt-3 flex h-12 w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <UnlockIcon /> Unlock the line
                      </button>
                    </motion.div>
                  ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}>
                      <button
                        onClick={() => (isDemo ? startDemo() : startReal(""))}
                        className="kz-cta mt-4 flex h-12 w-full items-center justify-center gap-2 text-sm"
                      >
                        <Download className="h-4 w-4" />
                        Receive {offer.files.length > 1 ? "files" : "file"}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                      <p className="kz-mono mt-2.5 text-center text-[11px] text-[var(--kz-smoke)]">
                        straight from {peer.name || "their"} device · nothing is stored on the way
                      </p>
                    </motion.div>
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
                  transition={{ duration: 0.28 }}
                >
                  <KeepTabNote text="stay on this tab — the line closes with it" />
                  <div className="mt-3">
                    <TransferPanel
                      pct={overall}
                      moved={totalMoved}
                      total={totalBytes}
                      bps={speed}
                      etaMs={etaMs}
                      files={offer.files.map((f) => ({
                        name: f.name,
                        size: f.size,
                        done: moved[f.name] ?? 0,
                      }))}
                      doneLabel="received"
                      caption={`${offer.files.length} file${offer.files.length > 1 ? "s" : ""} · ${doneCount} saved`}
                    />
                  </div>
                </motion.div>
              )}

              {/* ── ERROR ───────────────────────────────────────── */}
              {stage === "error" && (
                <motion.div
                  key="error"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                >
                  <div className="kz-inset flex items-start gap-4 px-5 py-5">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[rgba(255,99,99,0.4)] bg-[rgba(255,99,99,0.08)]">
                      <RotateCcw className="h-5 w-5 text-[var(--kz-coral)]" />
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
                    onClick={() => wipeTo(`/r/${code}`)}
                    className="kz-neutral-btn mt-4 flex h-12 w-full items-center justify-center gap-2 text-sm"
                  >
                    <RotateCcw className="h-4 w-4" /> Try the line again
                  </button>
                </motion.div>
              )}

              {/* ── DONE ────────────────────────────────────────── */}
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
                      {received.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-baseline gap-3 px-3.5 py-2.5">
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
                            className="kz-ghost-btn shrink-0 self-center rounded-lg p-2"
                            aria-label={`Save ${f.name} again`}
                            title="Save again"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="kz-mono mt-4 text-[11px] text-[var(--kz-smoke)]">
                    the line is closed now · bytes never touched a server in between
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <button
                      onClick={downloadReceipt}
                      className="kz-neutral-btn flex h-12 items-center justify-center gap-2 text-sm"
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

/* local-only djb2 for the demo payload gate (real rooms validate on the server) */
function hashPassLocal(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

function UnlockIcon() {
  return (
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
