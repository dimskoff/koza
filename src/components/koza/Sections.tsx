// SPDX-License-Identifier: MPL-2.0
"use client";

import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/kbd";
import { BoxMark, LinkMark } from "../marks";
import { GithubLink } from "../GithubLink";
import { wipeTo } from "../wipe";

/* ── Slim nav with product switcher & matching rounded-2xl radius ── */
export function KozaNav() {
  const pathname = usePathname();
  const isSubpage = pathname !== "/";

  return (
    <header className="px-4 pt-4">
      <div className="kz-glass mx-auto flex h-12 w-full max-w-2xl items-center justify-between rounded-2xl px-2.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="group flex h-9 cursor-pointer items-center gap-2.5 rounded-xl px-2.5 text-left transition-colors hover:bg-white/[0.05] data-[state=open]:bg-white/[0.06] outline-none"
              aria-label="Switch koza product"
            >
              <LinkMark size={19} />
              <span className="kz-mono text-[13.5px] font-medium text-[var(--kz-mist)]">
                koza<span className="text-[var(--kz-coral)]">.</span>click
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-ash)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            sideOffset={8}
            className="w-64 rounded-2xl border border-[var(--kz-hairline-strong)] bg-[#111214]/95 p-1.5 text-[var(--kz-mist)] shadow-[0_16px_48px_rgba(0,0,0,0.65)] backdrop-blur-xl"
          >
            <DropdownMenuLabel className="kz-mono px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
              Switch workspace
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="my-1 bg-[var(--kz-hairline)]" />
            <DropdownMenuItem
              onClick={() => {
                if (isSubpage) window.location.href = "/";
              }}
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 focus:bg-white/[0.06] focus:text-[var(--kz-mist)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[rgba(255,99,99,0.3)] bg-[rgba(255,99,99,0.08)]">
                <LinkMark size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="kz-mono text-[12.5px] font-medium text-[var(--kz-mist)]">
                  koza<span className="text-[var(--kz-coral)]">.</span>click
                </p>
                <p className="kz-mono text-[10.5px] text-[var(--kz-smoke)]">
                  Short links, zero strings
                </p>
              </div>
              <Check className="h-3.5 w-3.5 shrink-0 text-[var(--kz-coral)]" />
            </DropdownMenuItem>

            <DropdownMenuItem
              onClick={() => wipeTo("/box")}
              className="mt-0.5 flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 focus:bg-white/[0.06] focus:text-[var(--kz-mist)]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
                <BoxMark size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="kz-mono text-[12.5px] font-medium text-[var(--kz-mist)]">
                  box<span className="text-[var(--kz-coral)]">.</span>koza.click
                </p>
                <p className="kz-mono text-[10.5px] text-[var(--kz-smoke)]">
                  Direct peer-to-peer files
                </p>
              </div>
              <Kbd className="text-[9.5px]">P2P</Kbd>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {isSubpage && (
          <a
            href="/"
            className="kz-mono flex h-8 items-center gap-1.5 rounded-xl px-3 text-[11.5px] text-[var(--kz-ash)] transition-colors hover:bg-white/[0.05] hover:text-[var(--kz-mist)]"
          >
            <ArrowLeft className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
            Shortener
          </a>
        )}
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
