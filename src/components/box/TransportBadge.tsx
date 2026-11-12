// SPDX-License-Identifier: MPL-2.0
"use client";

import { Radio, Server } from "lucide-react";
import type { TransportMode } from "./webrtc";

/* Tells the user honestly which path their bytes take:
   direct  = WebRTC browser ↔ browser (DTLS), server not in the data path
   relay   = through the koza server over TLS (RAM only, never disk) */
export function TransportBadge({ mode }: { mode: TransportMode | null }) {
  if (!mode || mode === "connecting") return null;
  const direct = mode === "p2p-udp";
  return (
    <span
      className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-smoke)]"
      title={
        direct
          ? "Direct browser-to-browser connection (WebRTC, DTLS-encrypted). The server is not in the data path."
          : "Relayed through the server over TLS — in memory only, never written to disk."
      }
    >
      {direct ? (
        <Radio className="h-3.5 w-3.5 text-emerald-400" />
      ) : (
        <Server className="h-3.5 w-3.5 text-amber-400" />
      )}
      {direct ? "direct" : "relay"}
    </span>
  );
}
