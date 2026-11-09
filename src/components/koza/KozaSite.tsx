// SPDX-License-Identifier: MPL-2.0
"use client";

import { Toaster } from "sonner";
import { Shortener } from "./Shortener";
import { RecentLinks } from "./RecentLinks";
import { KozaFooter, KozaNav } from "./Sections";

export function KozaSite() {
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
      <KozaNav />
      <main className="flex flex-1 flex-col items-center px-4 pt-[13vh] pb-12 sm:pt-[17vh]">
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          Short links,{" "}
          <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
            zero strings
          </span>
          .
        </h1>
        <div className="mt-8 w-full max-w-2xl">
          <Shortener />
        </div>
        <div className="mt-5 w-full max-w-2xl">
          <RecentLinks />
        </div>
      </main>
      <KozaFooter />
    </div>
  );
}
