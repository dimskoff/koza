// SPDX-License-Identifier: MPL-2.0
"use client";

import {
  Archive,
  File as FileIcon,
  FileText,
  Film,
  Image as ImageIcon,
  Music,
  TriangleAlert,
} from "lucide-react";
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

/* ── keep-the-tab-open note — one quiet line ─────────────────── */
export function KeepTabNote({ text }: { text?: string }) {
  return (
    <p
      className="kz-mono flex items-center gap-2 text-[11px] leading-snug text-amber-200/75"
      role="alert"
    >
      <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-300/90" />
      {text ?? "keep this tab open — the line closes with it"}
      <span className="relative ml-0.5 flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
        <span className="absolute h-full w-full animate-ping rounded-full bg-amber-300/60" />
        <span className="h-1.5 w-1.5 rounded-full bg-amber-300/90" />
      </span>
    </p>
  );
}

/* ── TransferPanel — one honest transfer readout ─────────────── */
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
      <div className="px-5 pb-4 pt-5">
        <div className="flex items-baseline justify-between gap-3">
          <p className="kz-mono text-[30px] font-medium leading-none tracking-tight text-[var(--kz-mist)]">
            {allDone ? 100 : Math.floor(pct)}
            <span className="text-[15px] text-[var(--kz-smoke)]">%</span>
          </p>
          <p className="kz-mono text-right text-[11.5px] leading-relaxed text-[var(--kz-smoke)]">
            {prettyPair(moved, total)}
            {" · "}
            <span className="text-[var(--kz-ash)]">{fmtSpeed(bps)}</span>
            {" · "}
            {allDone ? (
              <span className="text-emerald-400">delivered</span>
            ) : etaMs > 0 ? (
              <span className="text-[var(--kz-ash)]">{fmtEta(etaMs)} left</span>
            ) : (
              "estimating…"
            )}
          </p>
        </div>
        <div className="relative mt-3 h-[5px] overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className={`h-full rounded-full transition-[width] duration-200 ${
              allDone ? "bg-emerald-400" : "bg-[var(--kz-coral)]"
            }`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
          {!allDone && <div className="kz-shimmer absolute inset-y-0 left-0 w-1/4" />}
        </div>
        {caption && (
          <p className="kz-mono mt-2.5 text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
            {caption}
          </p>
        )}
      </div>

      {/* per-file progress */}
      <ul
        className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)]"
        aria-label="File progress"
      >
        {files.map((f, i) => {
          const fPct = f.size > 0 ? Math.min(100, (f.done / f.size) * 100) : f.done >= 0 ? 100 : 0;
          const fDone = f.size > 0 ? fPct >= 100 : f.done > 0 || allDone;
          return (
            <li key={`${f.name}-${i}`} className="px-5 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">{f.name}</p>
                <p className="kz-mono shrink-0 text-[11px] text-[var(--kz-smoke)]">
                  {fDone ? (
                    <span className="text-emerald-400">{doneLabel}</span>
                  ) : f.done > 0 ? (
                    `${Math.floor(fPct)}% · ${prettySize(f.done)}`
                  ) : (
                    prettySize(f.size)
                  )}
                </p>
              </div>
              <div className="relative mt-1.5 h-[3px] overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className={`h-full rounded-full transition-[width] duration-150 ${
                    fDone ? "bg-emerald-400" : "bg-[var(--kz-coral)]"
                  }`}
                  style={{ width: `${fPct}%` }}
                />
                {!fDone && f.done > 0 && (
                  <div className="kz-shimmer absolute inset-y-0 left-0 w-1/4" />
                )}
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
        <Film className="h-4 w-4 text-[var(--kz-ash)]" />
      </span>
    );
  if (cat === "audio")
    return (
      <span className={cls} aria-hidden="true">
        <Music className="h-4 w-4 text-[var(--kz-ash)]" />
      </span>
    );
  if (cat === "archive")
    return (
      <span className={cls} aria-hidden="true">
        <Archive className="h-4 w-4 text-[var(--kz-ash)]" />
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
