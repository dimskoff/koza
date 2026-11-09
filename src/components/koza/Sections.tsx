// SPDX-License-Identifier: MPL-2.0
"use client";

import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { BoxMark, LinkMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { wipeTo } from "../wipe";

/* ── Slim nav with inline tactile workspace switcher ─────────── */
export function KozaNav() {
  const pathname = usePathname();

  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-2xl items-center justify-between rounded-2xl px-2">
        {/* Left: 1-click inline workspace switcher (koza.click <-> box) */}
        <div
          className="flex items-center gap-1 rounded-xl border border-[var(--kz-hairline)] bg-white/[0.025] p-1"
          role="navigation"
          aria-label="Workspace switcher"
        >
          <a
            href="/"
            className="flex h-7 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.07] px-2.5 text-[var(--kz-mist)] shadow-xs transition-colors"
            aria-current="page"
          >
            <LinkMark size={15} />
            <span className="kz-mono text-[12.5px] font-medium">
              koza<span className="text-[var(--kz-coral)]">.</span>click
            </span>
          </a>
          <button
            type="button"
            onClick={() => wipeTo("/box")}
            className="group flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[var(--kz-smoke)] transition-colors hover:bg-white/[0.04] hover:text-[var(--kz-mist)]"
            title="Switch to box.koza.click (P2P file transfer)"
          >
            <BoxMark size={14} />
            <span className="kz-mono text-[12px]">box</span>
          </button>
        </div>

        {/* Right: Quick navigation & live status */}
        <div className="flex items-center gap-1 pr-1">
          <a
            href="/docs"
            className={`kz-mono rounded-lg px-2.5 py-1.5 text-[11.5px] transition-colors ${
              pathname === "/docs"
                ? "bg-white/[0.07] text-[var(--kz-mist)]"
                : "text-[var(--kz-ash)] hover:bg-white/[0.04] hover:text-[var(--kz-mist)]"
            }`}
          >
            api
          </a>
          <a
            href="/status"
            className={`kz-mono flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] transition-colors ${
              pathname === "/status"
                ? "bg-white/[0.07] text-[var(--kz-mist)]"
                : "text-[var(--kz-ash)] hover:bg-white/[0.04] hover:text-[var(--kz-mist)]"
            }`}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            status
          </a>
          <span className="mx-0.5 hidden h-3.5 w-px bg-[var(--kz-hairline)] sm:block" />
          <div className="hidden sm:block">
            <GithubLink />
          </div>
        </div>
      </div>
    </header>
  );
}

/* ── One-line footer ─────────────────────────────────────────── */
export function KozaFooter() {
  return (
    <footer className="kz-hairline-t">
      <div className="kz-mono mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-[var(--kz-smoke)]">
        <a href="/policy" className="kz-ghost-btn flex items-center gap-0.5 rounded-md px-1.5 py-1">
          policy <ArrowUpRight className="h-3 w-3" />
        </a>
        <div className="flex items-center gap-1">
          <GithubLink />
          <a href="/status" className="kz-ghost-btn flex items-center gap-0.5 rounded-md px-1.5 py-1">
            status <ArrowUpRight className="h-3 w-3" />
          </a>
          <a href="/docs" className="kz-ghost-btn flex items-center gap-0.5 rounded-md px-1.5 py-1">
            api <ArrowUpRight className="h-3 w-3" />
          </a>
          <p className="px-1.5">© 2026 koza</p>
        </div>
      </div>
    </footer>
  );
}
