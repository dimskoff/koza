// SPDX-License-Identifier: MPL-2.0
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { BoxMark, LinkMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { switchTo, useSiteTransition } from "../transition";

/* ── Slim nav (box.koza.click style) ─────────────────────────── */
export function BoxNav() {
  const transitionTarget = useSiteTransition();
  const isSwitchingToUrl = transitionTarget === "url";

  const onHomeClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (typeof window !== "undefined" && window.location.hostname.startsWith("box.")) {
      e.preventDefault();
      window.location.href = "/";
    }
  };

  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-2xl items-center justify-between rounded-[14px] pl-4 pr-2">
        <a
          href="/box"
          onClick={onHomeClick}
          className="flex items-center gap-2.5"
          aria-label="box.koza.click home"
        >
          <motion.div
            key={isSwitchingToUrl ? "link-icon" : "box-icon"}
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2 }}
          >
            {isSwitchingToUrl ? <LinkMark size={20} /> : <BoxMark size={20} />}
          </motion.div>
          <span className="kz-mono flex items-center text-sm text-[var(--kz-mist)]">
            <AnimatePresence initial={false}>
              {!isSwitchingToUrl && (
                <motion.span
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: "auto", opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeOut" }}
                  className="inline-block overflow-hidden font-medium text-[var(--kz-coral)]"
                >
                  box.
                </motion.span>
              )}
            </AnimatePresence>
            <span>
              koza<span className="text-[var(--kz-coral)]">.</span>click
            </span>
          </span>
        </a>
        <div className="flex items-center gap-2">
          <button
            onClick={() => switchTo("url")}
            disabled={isSwitchingToUrl}
            className="kz-neutral-btn flex h-8 cursor-pointer items-center gap-1.5 px-3.5 text-[12px] transition-all disabled:opacity-80"
            aria-label="Switch to URL shortener"
          >
            {isSwitchingToUrl ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-[var(--kz-coral)]" />
                <span>url</span>
              </>
            ) : (
              <>
                <span>url</span>
                <ArrowUpRight className="h-3 w-3" strokeWidth={2.4} />
              </>
            )}
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
