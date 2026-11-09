// SPDX-License-Identifier: MPL-2.0
"use client";

import { ArrowUpRight } from "lucide-react";
import { LinkMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { wipeTo } from "../wipe";

/* ── Slim nav ────────────────────────────────────────────────── */
export function KozaNav() {
  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-2xl items-center justify-between rounded-[14px] pl-4 pr-2">
        <a href="/" className="flex items-center gap-2.5" aria-label="koza.click home">
          <LinkMark size={20} />
          <span className="kz-mono text-sm text-[var(--kz-mist)]">
            koza<span className="text-[var(--kz-coral)]">.</span>click
          </span>
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={() => wipeTo("/box")}
            className="kz-neutral-btn flex h-8 cursor-pointer items-center gap-1 px-3.5 text-[12px]"
            aria-label="Switch to box.koza.click"
          >
            box <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
          </button>
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
