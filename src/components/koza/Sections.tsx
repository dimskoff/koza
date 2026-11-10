// SPDX-License-Identifier: MPL-2.0
"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import { BoxMark, LinkMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { getProductUrl, prefetchProduct, switchTo, useProductTransition } from "../transition";

/* ── Slim nav for koza.click (unified max-w-xl) ──────────────── */
export function KozaNav() {
  const transition = useProductTransition();
  const isSwitchingToBox = transition === "box";
  const homeUrl = getProductUrl("url") || "/";

  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-xl items-center justify-between rounded-[14px] pl-4 pr-2">
        <a
          href={homeUrl}
          className="flex items-center gap-2.5 outline-none"
          aria-label="koza.click home"
        >
          <div className="shrink-0">
            {isSwitchingToBox ? <BoxMark size={20} /> : <LinkMark size={20} />}
          </div>
          <span className="kz-mono flex items-center text-sm text-[var(--kz-mist)]">
            <span
              className={`overflow-hidden font-medium text-[var(--kz-coral)] transition-all duration-200 ${
                isSwitchingToBox ? "max-w-[42px] opacity-100" : "max-w-0 opacity-0"
              }`}
            >
              box.
            </span>
            <span>
              koza<span className="text-[var(--kz-coral)]">.</span>click
            </span>
          </span>
        </a>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => switchTo("box")}
            onMouseEnter={() => prefetchProduct("box")}
            onFocus={() => prefetchProduct("box")}
            disabled={isSwitchingToBox}
            className="kz-neutral-btn flex h-8 w-[76px] cursor-pointer items-center justify-center gap-1.5 text-[12px] transition-all disabled:opacity-85"
            aria-label="Switch to box.koza.click"
          >
            {isSwitchingToBox ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-[var(--kz-coral)]" />
                <span>box</span>
              </>
            ) : (
              <>
                <span>box</span>
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}

/* ── One-line footer (unified max-w-xl) ──────────────────────── */
export function KozaFooter() {
  return (
    <footer className="kz-hairline-t">
      <div className="kz-mono mx-auto flex w-full max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3 text-[11px] text-[var(--kz-smoke)]">
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
