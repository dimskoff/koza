// SPDX-License-Identifier: MPL-2.0
"use client";

import { Fingerprint, HardDriveDownload, ShieldCheck, Zap } from "lucide-react";
import { Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TransferCard } from "./TransferCard";
import { BoxFooter, BoxNav } from "./Sections";

export function BoxSite() {
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
        <div className="mb-4 flex flex-wrap items-center justify-center gap-2">
          <Badge variant="coral">
            <Zap className="h-3 w-3" /> 6x Parallel Stream + P2P
          </Badge>
          <Badge variant="secondary">
            <HardDriveDownload className="h-3 w-3 text-emerald-400" /> Zero Server Storage
          </Badge>
          <Badge variant="secondary">
            <Fingerprint className="h-3 w-3 text-sky-400" /> Cryptographic Fingerprint
          </Badge>
          <Badge variant="secondary">
            <ShieldCheck className="h-3 w-3 text-amber-300" /> E2E Encrypted
          </Badge>
        </div>

        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          Files that travel{" "}
          <span className="bg-gradient-to-r from-[var(--kz-coral)] via-[#ff8c7a] to-[#ffb0a6] bg-clip-text text-transparent">
            straight to your peer
          </span>
          .
        </h1>
        <p className="mt-2.5 max-w-md text-center text-sm text-[var(--kz-ash)]">
          Drop up to 12 files, share a 6-character code, and stream bytes directly between browsers with zero disk footprints.
        </p>

        <div className="mt-7 w-full max-w-xl">
          <TransferCard />
        </div>
      </main>
      <BoxFooter />
    </div>
  );
}
