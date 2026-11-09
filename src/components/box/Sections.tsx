// SPDX-License-Identifier: MPL-2.0
"use client";

import { ArrowUpRight } from "lucide-react";
import { BoxMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { wipeTo } from "../wipe";

/* ── Slim nav (box.koza.click style) ─────────────────────────── */
export function BoxNav() {
  const onHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window !== "undefined" && window.location.hostname.startsWith("box.")) {
      e.preventDefault();
      window.location.href = "/";
    }
  };

  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-2xl items-center justify-between rounded-full pl-4 pr-2">
        <a
          href="/box"
          onClick={onHomeClick}
          className="flex items-center gap-2.5"
          aria-label="box.koza.click home"
        >
          <BoxMark size={20} />
          <span className="kz-mono text-sm text-[var(--kz-mist)]">
            box<span className="text-[var(--kz-coral)]">.</span>koza.click
          </span>
        </a>
        <div className="flex items-center gap-2">
          <a
            href="/status"
            className="kz-mono hidden items-center gap-1.5 text-[11px] text-[var(--kz-ash)] hover:text-[var(--kz-mist)] transition-colors sm:flex px-2 py-1 rounded-full hover:bg-white/[0.04]"
            aria-label="Direct encrypted transfer & status"
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            status
          </a>
          <button
            onClick={() => wipeTo("/")}
            className="kz-neutral-btn flex h-8 cursor-pointer items-center gap-1.5 px-3.5 text-[12px]"
            aria-label="Switch to koza.click"
          >
            koza.click <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── One-line footer ─────────────────────────────────────────── */
export function BoxFooter() {
  return (
    <footer className="kz-hairline-t">
      <div className="kz-mono mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-[var(--kz-smoke)]">
        <p className="whitespace-nowrap">peer-to-peer · nothing stored · MPL-2.0</p>
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
