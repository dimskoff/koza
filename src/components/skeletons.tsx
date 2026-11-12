// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, type ReactNode } from "react";
import { AtSign, Sparkles, Zap } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";

/* Skeletons are pixel twins of the real cards: identical markup and classes,
   with the real text kept in place but made transparent. Line heights, paddings
   and widths therefore match exactly, so swapping skeleton ↔ card never shifts. */

function Ghost({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={`animate-pulse select-none rounded-md bg-white/[0.07] text-transparent [&_*]:invisible ${className}`}
    >
      {children}
    </span>
  );
}

function GhostIcon({ className }: { className: string }) {
  return <span className={`inline-block animate-pulse rounded-[4px] bg-white/[0.07] ${className}`} />;
}

/** twin of <Shortener /> in its idle state */
export function ShortenerSkeleton() {
  return (
    <div className="relative mx-auto w-full max-w-2xl" aria-hidden="true">
      <div className="kz-edge relative overflow-hidden pb-2.5">
        <div className="relative flex min-h-[56px] items-center gap-2 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4">
          <div className="flex w-full items-center gap-2">
            <span className="kz-mono flex h-10 min-w-0 flex-1 items-center text-[15px]">
              <Ghost>Paste a link...</Ghost>
            </span>
            <span className="flex h-10 shrink-0 animate-pulse items-center justify-center gap-1.5 rounded-[9px] bg-white/[0.1] px-4 text-[13px] font-semibold text-transparent">
              <Sparkles className="invisible h-3.5 w-3.5" />
              Shorten link
            </span>
          </div>
        </div>
        <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
          <span className="kz-mono flex items-center gap-2 text-xs">
            <AtSign className="h-3.5 w-3.5 text-white/[0.12]" />
            <Ghost>
              Advanced options <span className="text-[10px]">▾</span>
            </Ghost>
          </span>
          <span className="kz-mono hidden items-center gap-1.5 text-[11px] md:inline-flex">
            <Ghost>
              <Kbd>Enter ↵</Kbd> to shorten
            </Ghost>
          </span>
        </div>
      </div>
    </div>
  );
}

/** twin of <TransferCard /> in its "collect" stage */
export function TransferSkeleton() {
  return (
    <div className="kz-edge w-full max-w-xl" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
        <span className="kz-mono text-[11px] uppercase tracking-wider">
          <Ghost>01 · stage files</Ghost>
        </span>
        <span className="flex items-center gap-3" />
      </div>
      <div className="p-5 sm:p-6">
        <div className="kz-inset relative flex flex-col items-center justify-center border border-dashed border-[var(--kz-hairline-strong)] px-6 py-9 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04]">
            <Zap className="h-5 w-5 animate-pulse text-[var(--kz-coral)] opacity-60" />
          </div>
          <p className="text-[16px] font-medium">
            <Ghost>Drop files here</Ghost>
          </p>
          <p className="kz-mono mt-1 text-[12px]">
            <Ghost>or press to browse · any type · stays on your device</Ghost>
          </p>
        </div>
      </div>
    </div>
  );
}

/* ── arrival crossfade ───────────────────────────────────────────────────
   When the user switches product (url ↔ box) the leaving page shows the
   destination skeleton, then navigates with #koza:switch-arrival. An inline
   script in <head> turns that hash into html[data-arrive] BEFORE first paint,
   so the arriving page starts on the very same skeleton and crossfades into
   the real card — no flash, no hydration mismatch. */

export function ArrivalVeil({ skeleton, children }: { skeleton: ReactNode; children: ReactNode }) {
  useEffect(() => {
    const root = document.documentElement;
    if (!("arrive" in root.dataset)) return;
    /* let the skeleton paint at least once, then release the crossfade.
       setTimeout (not rAF) so a backgrounded tab can never get stuck on it. */
    const t = window.setTimeout(() => root.removeAttribute("data-arrive"), 60);
    return () => {
      window.clearTimeout(t);
      root.removeAttribute("data-arrive");
    };
  }, []);

  return (
    <div className="relative w-full">
      <div className="kz-veil-content">{children}</div>
      <div className="kz-veil pointer-events-none absolute inset-x-0 top-0">{skeleton}</div>
    </div>
  );
}