// SPDX-License-Identifier: MPL-2.0
"use client";

import { getSite } from "@/lib/site";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Copy,
  KeyRound,
  Plus,
  QrCode,
  RotateCcw,
  Timer,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { KozaQr } from "../koza/QrCode";
import { FileGlyph, FingerprintHover, PeerSpin, ScanSweep } from "./visuals";
import { BoxLobby, BoxSender, computeTransferFingerprint } from "./webrtc";
import { ReceiversList, type ReceiverRow } from "./ReceiversList";
import { type BoxFile, fmtDuration, prettySize, shortLinkOf, SpeedMeter } from "./lib";

/* collect → live (room open, any number of friends download) → back to collect */
type Stage = "collect" | "live" | "error";

interface StagedItem {
  meta: BoxFile;
  file: File;
}

interface Session {
  row: ReceiverRow;
  engine: BoxSender | null;
  meter: SpeedMeter;
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
  const [rows, setRows] = useState<ReceiverRow[]>([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [errorReason, setErrorReason] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const lobbyRef = useRef<BoxLobby | null>(null);
  const sessionsRef = useRef(new Map<string, Session>());
  const joinCounter = useRef(0);
  const stagedRef = useRef<StagedItem[]>([]);
  const codeRef = useRef("");
  const tokenRef = useRef("");
  const t0Ref = useRef(0);
  const tick = useRef<number | null>(null);
  const linkCopiedTimer = useRef<number | null>(null);

  const files = staged.map((s) => s.meta);
  const totalBytes = files.reduce((a, f) => a + f.size, 0);

  useEffect(() => {
    stagedRef.current = staged;
  }, [staged]);

  const publishRows = useCallback(() => {
    setRows([...sessionsRef.current.values()].map((s) => ({ ...s.row })));
  }, []);

  const disposeAll = useCallback(() => {
    lobbyRef.current?.dispose();
    lobbyRef.current = null;
    for (const s of sessionsRef.current.values()) s.engine?.dispose();
    sessionsRef.current.clear();
    if (tick.current !== null) {
      window.clearInterval(tick.current);
      tick.current = null;
    }
  }, []);

  useEffect(
    () => () => {
      if (linkCopiedTimer.current !== null) window.clearTimeout(linkCopiedTimer.current);
      disposeAll();
    },
    [disposeAll],
  );

  const live = stage === "live";
  const anyActive = rows.some((r) => r.status === "connecting" || r.status === "sending");

  /* the browser asks before closing the tab while the line is open */
  useEffect(() => {
    if (!live) return;
    const guard = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [live]);

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

  /* a friend opened the link: give them their own sender session */
  const startSession = useCallback(
    (peer: string) => {
      const sessions = sessionsRef.current;
      const existing = sessions.get(peer);
      if (existing && existing.row.status !== "left" && existing.row.status !== "failed") return;
      existing?.engine?.dispose();

      joinCounter.current += 1;
      const s: Session = {
        row: {
          peer,
          n: existing?.row.n ?? joinCounter.current,
          status: "connecting",
          moved: 0,
          bps: 0,
          transport: null,
        },
        engine: null,
        meter: new SpeedMeter(),
      };
      sessions.set(peer, s);

      const set = (patch: Partial<ReceiverRow>) => {
        if (sessions.get(peer) !== s) return;
        Object.assign(s.row, patch);
        publishRows();
      };

      const engine = new BoxSender({
        onJoined: () => {},
        onPeerJoined: () => {},
        onPeerLeft: () => {
          if (s.row.status !== "done") set({ status: "left" });
          s.engine?.dispose();
          s.engine = null;
        },
        onTransportChange: (mode) => set({ transport: mode }),
        onChannelOpen: (mode) => {
          set({ status: "sending", transport: mode });
          engine.sendFiles(stagedRef.current.map((x) => x.file)).catch((err) => {
            if (s.row.status !== "done") set({ status: "failed", error: String(err?.message ?? err) });
          });
        },
        onProgress: (bytes) => {
          s.row.moved = bytes;
          s.meter.push(bytes);
        },
        onFileQueued: () => {},
        onFileDone: () => {},
        onAllDone: () => {
          set({ status: "done", moved: stagedRef.current.reduce((a, x) => a + x.meta.size, 0), bps: 0 });
          toast.success(`Delivered to friend ${s.row.n}`);
          window.setTimeout(() => {
            s.engine?.dispose();
            s.engine = null;
          }, 800);
        },
        onError: (reason) => {
          if (s.row.status !== "done") set({ status: "failed", error: reason });
        },
      });
      s.engine = engine;
      publishRows();
      void engine.connect(codeRef.current, tokenRef.current, peer);
    },
    [publishRows],
  );

  const startTransfer = async () => {
    const currentStaged = stagedRef.current;
    if (currentStaged.length === 0) return;
    const pw = password.trim();
    if (pw.length > 0 && pw.length < 4) {
      toast.error("Password is too short", { description: "Use at least 4 characters" });
      return;
    }

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
    codeRef.current = c;
    tokenRef.current = token;
    setCode(c);
    setFingerprint(
      created.room.fingerprint ||
        computeTransferFingerprint(
          c,
          currentStaged.map((s) => ({ name: s.meta.name, size: s.meta.size })),
        ),
    );
    disposeAll();
    joinCounter.current = 0;
    setRows([]);
    setElapsed(0);
    setStage("live");

    t0Ref.current = Date.now();
    tick.current = window.setInterval(() => {
      setElapsed(Date.now() - t0Ref.current);
      for (const s of sessionsRef.current.values()) {
        s.row.bps = s.row.status === "sending" ? s.meter.bps : 0;
      }
      publishRows();
    }, 250);

    const lobby = new BoxLobby({
      onReady: () => {},
      onReceiverJoined: (peer) => startSession(peer),
      onReceiverLeft: (peer) => {
        const s = sessionsRef.current.get(peer);
        if (!s) return;
        /* never got going → just drop the row */
        if (s.row.status === "connecting") {
          s.engine?.dispose();
          sessionsRef.current.delete(peer);
          publishRows();
        }
      },
      onError: (reason) => {
        disposeAll();
        setErrorReason(reason);
        setStage("error");
      },
    });
    lobbyRef.current = lobby;
    lobby.connect(c, token);
  };

  /* close the line for everyone and go back to the staged files */
  const closeLine = () => {
    const delivered = [...sessionsRef.current.values()].filter((s) => s.row.status === "done").length;
    disposeAll();
    closeRoom(codeRef.current, tokenRef.current);
    codeRef.current = "";
    tokenRef.current = "";
    setRows([]);
    setStage("collect");
    toast(
      delivered > 0
        ? `Line closed · delivered to ${delivered} friend${delivered > 1 ? "s" : ""}`
        : "Line closed",
    );
  };

  const resetAll = () => {
    disposeAll();
    closeRoom(codeRef.current, tokenRef.current);
    codeRef.current = "";
    tokenRef.current = "";
    setStaged([]);
    stagedRef.current = [];
    setRows([]);
    setStage("collect");
    setCode("");
    setFingerprint("");
    setElapsed(0);
    setPassword("");
    setErrorReason("");
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
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const invite = shortLinkOf(code);
  const deliveredCount = rows.filter((r) => r.status === "done").length;
  const activeCount = rows.filter((r) => r.status === "sending" || r.status === "connecting").length;

  return (
    <div className="kz-edge w-full max-w-xl" id="transfer">
      {/* stage strip */}
      <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
        <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
          {stage === "collect" && "01 · stage files"}
          {live && (anyActive ? "03 · sending" : "02 · line open")}
          {stage === "error" && "line trouble"}
        </span>

        <span className="flex items-center gap-3">
          {live && fingerprint && <FingerprintHover fingerprint={fingerprint} />}
          {live && (
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
              className={`mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04] transition-transform duration-150 ${
                dragging ? "scale-110" : ""
              }`}
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

      {/* ── LINE OPEN: link + every friend who joined ───────────── */}
      {live && (
        <div className="p-5 sm:p-6">
          <div className="kz-inset flex items-center justify-between gap-2 p-2 pl-3.5">
            <button
              onClick={copyInvite}
              className="kz-mono min-w-0 flex-1 cursor-pointer truncate text-left text-[15px] font-medium tracking-tight"
              title="Click to copy link"
            >
              <span className="text-[var(--kz-ash)]">{getSite().boxHost}/r/</span>
              <span className="text-[var(--kz-coral)]">{code}</span>
            </button>
            <div className="flex shrink-0 items-center gap-1">
              <button
                onClick={() => setQrOpen(true)}
                className="kz-ghost-btn flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--kz-ash)] hover:bg-white/[0.06] hover:text-[var(--kz-mist)]"
                aria-label="Show QR code"
                title="QR code"
              >
                <QrCode className="h-4 w-4" />
              </button>
              <button
                onClick={copyInvite}
                className="kz-cta flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] px-3.5 text-[12.5px]"
              >
                {linkCopied ? (
                  <>
                    <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="mt-4">
            <AnimatePresence mode="wait" initial={false}>
              {rows.length === 0 ? (
                <motion.div
                  key="scan"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.24 }}
                  className="kz-inset flex flex-col items-center px-4 py-6 text-center"
                >
                  <div className="flex items-center gap-2.5">
                    <PeerSpin />
                    <p className="text-[14px] font-medium text-[var(--kz-mist)]">
                      Waiting for friends
                    </p>
                  </div>
                  <p className="kz-mono mt-1.5 text-[11.5px] text-[var(--kz-smoke)]">
                    share the link · anyone with it can download · keep this tab open
                  </p>
                  <div className="mt-3.5">
                    <ScanSweep />
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.24 }}
                >
                  <ReceiversList rows={rows} total={totalBytes} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-4 flex items-center justify-between gap-2 border-t border-[var(--kz-hairline)] pt-3">
            <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
              {files.length} file{files.length > 1 ? "s" : ""} · {prettySize(totalBytes)}
              {rows.length > 0 &&
                ` · ${deliveredCount} delivered${activeCount ? ` · ${activeCount} active` : ""}`}
            </span>
            <button
              onClick={closeLine}
              className="kz-mono flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] text-[var(--kz-ash)] transition-colors hover:bg-white/[0.05] hover:text-[var(--kz-coral)]"
            >
              <X className="h-3.5 w-3.5" />
              Close line
            </button>
          </div>
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
                {errorReason || "something went wrong"}
              </p>
              <p className="kz-mono mt-2 text-[11px] text-[var(--kz-smoke)]">
                nothing was stored anywhere — the bytes died with the line
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={resetAll}
              className="kz-neutral-btn flex h-12 cursor-pointer items-center justify-center gap-2 text-sm"
            >
              <Plus className="h-4 w-4" /> New transfer
            </button>
            <button
              onClick={() => void startTransfer()}
              className="kz-cta flex h-12 cursor-pointer items-center justify-center gap-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" /> Try again
            </button>
          </div>
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
                {getSite().boxHost}/r/<span className="text-[var(--kz-coral)]">{code}</span>
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
  );
}
