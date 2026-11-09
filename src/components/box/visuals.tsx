// SPDX-License-Identifier: MPL-2.0
"use client";

import {
  Activity,
  Archive,
  CheckCircle2,
  Clock,
  File as FileIcon,
  FileText,
  Film,
  Fingerprint,
  HardDrive,
  Image as ImageIcon,
  Music,
  Radio,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { fileCategory, fmtEta, fmtSpeed, prettyPair, prettySize } from "./lib";

/* ── PeerSpin — searching ring ───────────────────────────────── */
export function PeerSpin({ size = 16 }: { size?: number }) {
  return (
    <span
      className="kz-spin-fast inline-block shrink-0 rounded-full border-2 border-white/10 border-t-[var(--kz-coral)]"
      style={{ width: size, height: size }}
      role="img"
      aria-label="Searching"
    />
  );
}

/* ── ScanSweep — slim indeterminate bar under the search line ── */
export function ScanSweep({ width = 168 }: { width?: number }) {
  return (
    <span
      className="relative block h-[3px] overflow-hidden rounded-full bg-white/[0.06]"
      style={{ width }}
      aria-hidden="true"
    >
      <span className="kz-sweep absolute inset-y-0 left-0 w-1/3 rounded-full bg-gradient-to-r from-transparent via-[var(--kz-coral)] to-transparent" />
    </span>
  );
}

/* ── PeerAvatar — initial disc ───────────────────────────────── */
export function PeerAvatar({ name, size = 44 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full border border-[rgba(255,99,99,0.3)] bg-[rgba(255,99,99,0.06)]"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span
        className="kz-mono font-medium uppercase text-[var(--kz-coral)]"
        style={{ fontSize: size * 0.36 }}
      >
        {name.charAt(0)}
      </span>
    </span>
  );
}

/* ── three breathing dots after "connecting" ─────────────────── */
export function ConnectingDots() {
  return (
    <span className="ml-1.5 inline-flex items-end gap-1" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-[var(--kz-coral)]"
          style={{
            animation: "kz-dot 0.9s ease-in-out infinite",
            animationDelay: `${i * 0.18}s`,
          }}
        />
      ))}
    </span>
  );
}

/* ── FingerprintBadge — cryptographic session verification pill ── */
export function FingerprintBadge({ fingerprint }: { fingerprint: string }) {
  if (!fingerprint) return null;
  return (
    <Badge
      variant="sky"
      className="gap-1.5 px-2.5 py-1 text-[11px] tracking-wider"
      title="Session SHA-256 verification fingerprint"
    >
      <Fingerprint className="h-3.5 w-3.5 shrink-0 text-sky-400" />
      <span className="text-sky-200/70">FP</span>
      <span className="font-semibold text-sky-200">{fingerprint}</span>
    </Badge>
  );
}

/* ── KeepTabNote — separate styled shadcn Alert block ────────── */
export function KeepTabNote({
  title = "Keep this tab open",
  text = "stay on this tab — the line closes with it",
}: {
  title?: string;
  text?: string;
}) {
  return (
    <Alert variant="warning" className="border-amber-500/30 bg-amber-500/[0.06]">
      <Radio className="h-4 w-4 text-amber-400 animate-pulse" />
      <AlertTitle className="flex items-center justify-between gap-2 text-xs font-semibold text-amber-200">
        <span>{title}</span>
        <Badge variant="amber" className="px-2 py-0 text-[10px]">
          live session
        </Badge>
      </AlertTitle>
      <AlertDescription className="kz-mono text-[11.5px] text-amber-200/80">
        {text}
      </AlertDescription>
    </Alert>
  );
}

/* ── TransferPanel — rich shadcn transfer readout ────────────── */
export interface PanelFile {
  name: string;
  size: number;
  done: number;
}

export function TransferPanel({
  pct,
  moved,
  total,
  bps,
  etaMs,
  files,
  doneLabel = "done",
  caption,
  fingerprint,
}: {
  pct: number;
  moved: number;
  total: number;
  bps: number;
  etaMs: number;
  files: PanelFile[];
  doneLabel?: string;
  caption?: string;
  fingerprint?: string;
}) {
  const allDone = pct >= 100;
  return (
    <div className="kz-edge overflow-hidden">
      {/* Top metric header */}
      <div className="px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <p className="kz-mono text-[32px] font-semibold leading-none tracking-tight text-[var(--kz-mist)]">
              {allDone ? 100 : Math.floor(pct)}
              <span className="text-[16px] text-[var(--kz-smoke)]">%</span>
            </p>
            {caption && <Badge variant="secondary">{caption}</Badge>}
          </div>
          {fingerprint && <FingerprintBadge fingerprint={fingerprint} />}
        </div>

        {/* Progress bar using shadcn Progress */}
        <div className="mt-4">
          <Progress
            value={allDone ? 100 : pct}
            className="h-2.5"
            indicatorClassName={
              allDone
                ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.55)]"
                : undefined
            }
          />
        </div>

        {/* 3-column telemetry mini cards */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="kz-inset flex items-center gap-2 px-3 py-2">
            <HardDrive className="h-3.5 w-3.5 shrink-0 text-[var(--kz-coral)]" />
            <div className="min-w-0">
              <p className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
                Transferred
              </p>
              <p className="kz-mono truncate text-[12px] text-[var(--kz-mist)]">
                {prettyPair(moved, total)}
              </p>
            </div>
          </div>
          <div className="kz-inset flex items-center gap-2 px-3 py-2">
            <Activity className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <div className="min-w-0">
              <p className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
                Throughput
              </p>
              <p className="kz-mono truncate text-[12px] text-[var(--kz-mist)]">
                {fmtSpeed(bps)}
              </p>
            </div>
          </div>
          <div className="kz-inset flex items-center gap-2 px-3 py-2">
            <Clock className="h-3.5 w-3.5 shrink-0 text-sky-400" />
            <div className="min-w-0">
              <p className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
                Remaining
              </p>
              <p className="kz-mono truncate text-[12px] text-[var(--kz-mist)]">
                {allDone ? "Complete" : etaMs > 0 ? fmtEta(etaMs) : "Calculating…"}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Per-file progress list */}
      <ul
        className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)]"
        aria-label="File progress"
      >
        {files.map((f, i) => {
          const fPct = f.size > 0 ? Math.min(100, (f.done / f.size) * 100) : f.done >= 0 ? 100 : 0;
          const fDone = f.size > 0 ? fPct >= 100 : f.done > 0 || allDone;
          return (
            <li key={`${f.name}-${i}`} className="px-5 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2.5">
                  <FileGlyph name={f.name} />
                  <div className="min-w-0">
                    <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">{f.name}</p>
                    <p className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                      {prettySize(f.size)}
                    </p>
                  </div>
                </div>
                <div className="shrink-0">
                  {fDone ? (
                    <Badge variant="emerald">
                      <CheckCircle2 className="h-3 w-3" /> {doneLabel}
                    </Badge>
                  ) : f.done > 0 ? (
                    <Badge variant="coral">{Math.floor(fPct)}%</Badge>
                  ) : (
                    <Badge variant="secondary">queued</Badge>
                  )}
                </div>
              </div>
              <div className="mt-2">
                <Progress
                  value={fDone ? 100 : fPct}
                  className="h-1.5"
                  indicatorClassName={
                    fDone
                      ? "bg-gradient-to-r from-emerald-500 to-emerald-400 shadow-none"
                      : undefined
                  }
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ── file glyph by extension ─────────────────────────────────── */
export function FileGlyph({ name }: { name: string }) {
  const cat = fileCategory(name);
  const cls =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04]";
  if (cat === "image")
    return (
      <span className={cls} aria-hidden="true">
        <ImageIcon className="h-4 w-4 text-[var(--kz-coral)]" />
      </span>
    );
  if (cat === "video")
    return (
      <span className={cls} aria-hidden="true">
        <Film className="h-4 w-4 text-sky-400" />
      </span>
    );
  if (cat === "audio")
    return (
      <span className={cls} aria-hidden="true">
        <Music className="h-4 w-4 text-amber-300" />
      </span>
    );
  if (cat === "archive")
    return (
      <span className={cls} aria-hidden="true">
        <Archive className="h-4 w-4 text-emerald-400" />
      </span>
    );
  if (cat === "doc")
    return (
      <span className={cls} aria-hidden="true">
        <FileText className="h-4 w-4 text-[var(--kz-ash)]" />
      </span>
    );
  return (
    <span className={cls} aria-hidden="true">
      <FileIcon className="h-4 w-4 text-[var(--kz-ash)]" />
    </span>
  );
}
