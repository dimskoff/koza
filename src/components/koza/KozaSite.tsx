"use client";

import { Toaster } from "sonner";
import { Shortener } from "./Shortener";
import { RecentLinks } from "./RecentLinks";
import { KozaFooter, KozaNav } from "./Sections";
import { GithubMark, KOZA_REPO } from "../GithubLink";

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
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
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

        {/* open-source strip — the whole thing is on github, run your own */}
        <a
          href={KOZA_REPO}
          target="_blank"
          rel="noreferrer"
          className="kz-inset group mt-5 flex w-full max-w-2xl items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.05]"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04]">
            <GithubMark className="h-4 w-4 text-[var(--kz-mist)] transition-colors group-hover:text-[var(--kz-coral)]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--kz-mist)]">
              open-source — read every line, run your own koza
            </span>
            <span className="kz-mono mt-0.5 block truncate text-[11px] text-[var(--kz-smoke)]">
              github.com/dimskoff/koza · one json file · docker compose up
            </span>
          </span>
          <span className="kz-mono hidden shrink-0 text-[11px] text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-coral)] sm:block">
            self-host →
          </span>
        </a>
      </main>
      <KozaFooter />
    </div>
  );
}
