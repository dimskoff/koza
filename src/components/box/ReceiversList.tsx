// SPDX-License-Identifier: MPL-2.0
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, LogOut, TriangleAlert } from "lucide-react";
import { PeerAvatar, PeerSpin } from "./visuals";
import { TransportBadge } from "./TransportBadge";
import type { TransportMode } from "./webrtc";
import { fmtSpeed, prettySize } from "./lib";

export type ReceiverStatus = "connecting" | "sending" | "done" | "failed" | "left";

export interface ReceiverRow {
  peer: string;
  /** 1-based join order, for a friendly label */
  n: number;
  status: ReceiverStatus;
  moved: number;
  bps: number;
  transport: TransportMode | null;
  error?: string;
}

const STATUS_TEXT: Record<ReceiverStatus, string> = {
  connecting: "connecting",
  sending: "downloading",
  done: "delivered",
  failed: "failed",
  left: "left",
};

/* Every friend who opened the link, each with their own live progress. */
export function ReceiversList({ rows, total }: { rows: ReceiverRow[]; total: number }) {
  return (
    <ul className="space-y-2" aria-label="Receivers">
      <AnimatePresence initial={false}>
        {rows.map((r) => {
          const pct = total > 0 ? Math.min(100, (r.moved / total) * 100) : r.status === "done" ? 100 : 0;
          const shown = r.status === "done" ? 100 : pct;
          return (
            <motion.li
              key={r.peer}
              layout="position"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="kz-inset px-3.5 py-3"
            >
              <div className="flex items-center gap-3">
                <PeerAvatar name={String(r.n)} size={32} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[13.5px] font-medium text-[var(--kz-mist)]">Friend {r.n}</p>
                    {(r.status === "sending" || r.status === "done") && (
                      <TransportBadge mode={r.transport} />
                    )}
                  </div>
                  <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-smoke)]">
                    {r.status === "sending"
                      ? `${prettySize(r.moved)} / ${prettySize(total)} · ${fmtSpeed(r.bps)}`
                      : r.status === "failed"
                        ? r.error || "the transfer failed"
                        : r.status === "left" && r.moved < total
                          ? `left at ${Math.round(pct)}%`
                          : STATUS_TEXT[r.status]}
                  </p>
                </div>
                <span className="kz-mono flex shrink-0 items-center gap-1.5 text-[12px] text-[var(--kz-ash)]">
                  {r.status === "connecting" && <PeerSpin size={13} />}
                  {r.status === "done" && <Check className="h-4 w-4 text-emerald-400" strokeWidth={2.6} />}
                  {r.status === "failed" && <TriangleAlert className="h-4 w-4 text-[var(--kz-coral)]" />}
                  {r.status === "left" && <LogOut className="h-3.5 w-3.5" />}
                  {(r.status === "sending" || r.status === "done") && `${Math.round(shown)}%`}
                </span>
              </div>
              <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className={`h-full rounded-full transition-[width] duration-300 ease-out ${
                    r.status === "done"
                      ? "bg-emerald-400"
                      : r.status === "failed" || r.status === "left"
                        ? "bg-white/20"
                        : "bg-[var(--kz-coral)]"
                  }`}
                  style={{ width: `${shown}%` }}
                />
              </div>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}
