// SPDX-License-Identifier: MPL-2.0
"use client";

import { Toaster } from "sonner";
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
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          Files that travel{" "}
          <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
            straight
          </span>
          .
        </h1>
        <div className="mt-7 w-full max-w-xl">
          <TransferCard />
        </div>
      </main>
      <BoxFooter />
    </div>
  );
}
