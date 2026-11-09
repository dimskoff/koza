// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  X,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { KozaFooter, KozaNav } from "./Sections";
import { hostOf } from "./lib";

type GateState = "loading" | "missing" | "locked" | "unlocked";

export function LinkGate({
  slug,
  initialState,
}: {
  slug: string;
  initialState?: "locked" | "missing";
}) {
  const cleanSlug = slug.trim().toLowerCase();
  const [state, setState] = useState<GateState>(initialState ?? "loading");
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Fallback probe only if SSR didn't already resolve state */
  useEffect(() => {
    if (initialState) return;
    let alive = true;
    fetch(`/api/v1/links/${encodeURIComponent(cleanSlug)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            link?: { url?: string | null; password?: boolean };
          } | null,
        ) => {
          if (!alive) return;
          if (!data?.link) {
            setState("missing");
            return;
          }
          if (data.link.password) {
            setState("locked");
            return;
          }
          if (data.link.url) {
            void fetch(`/api/v1/links/${encodeURIComponent(cleanSlug)}/hit`, {
              method: "POST",
              keepalive: true,
            }).catch(() => {});
            window.location.replace(data.link.url);
            return;
          }
          setState("missing");
        },
      )
      .catch(() => {
        if (alive) setState("missing");
      });
    return () => {
      alive = false;
    };
  }, [cleanSlug, initialState]);

  const unlock = () => {
    if (!pw.trim() || unlocking) return;
    setUnlocking(true);
    setPwWrong(false);
    fetch(`/api/v1/links/${encodeURIComponent(cleanSlug)}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    })
      .then(async (r) => {
        if (r.status === 200) {
          const d = (await r.json()) as { url?: string };
          if (d.url) {
            setUnlockedUrl(d.url);
            setState("unlocked");
            void fetch(`/api/v1/links/${encodeURIComponent(cleanSlug)}/hit`, {
              method: "POST",
              keepalive: true,
            }).catch(() => {});
            window.location.replace(d.url);
            return;
          }
        }
        setPwWrong(true);
        inputRef.current?.focus();
      })
      .catch(() => setPwWrong(true))
      .finally(() => setUnlocking(false));
  };

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          {state === "missing" ? (
            <>
              Link not{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                found
              </span>
              .
            </>
          ) : state === "unlocked" ? (
            <>
              Redirecting{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                now
              </span>
              .
            </>
          ) : (
            <>
              Protected{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                link
              </span>
              .
            </>
          )}
        </h1>

        <div className="mt-8 w-full max-w-xl">
          <AnimatePresence mode="wait" initial={false}>
            {/* ── FALLBACK SKELETON ─────────────────────────────── */}
            {state === "loading" && (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="kz-edge overflow-hidden p-4"
              >
                <Skeleton className="h-10 w-full rounded-xl bg-white/[0.05]" />
                <div className="mt-3 flex items-center justify-between">
                  <Skeleton className="h-3.5 w-32 rounded-md bg-white/[0.04]" />
                  <Skeleton className="h-3.5 w-20 rounded-md bg-white/[0.04]" />
                </div>
              </motion.div>
            )}

            {/* ── PASSWORD GATE (Sleek inline bar like Shortener) ── */}
            {state === "locked" && (
              <motion.div
                key="locked"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
              >
                <motion.div
                  animate={pwWrong ? { x: [0, -8, 8, -6, 6, -2, 0] } : { x: 0 }}
                  transition={{ duration: 0.4 }}
                  className="kz-edge relative overflow-hidden pb-2.5"
                  style={
                    pwWrong
                      ? {
                          boxShadow:
                            "0 0 0 1px rgba(255,99,99,0.55), 0 12px 36px rgba(0,0,0,0.45)",
                        }
                      : undefined
                  }
                >
                  <div className="relative flex min-h-[56px] items-center gap-2.5 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4 transition-colors focus-within:bg-white/[0.04]">
                    <KeyRound className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
                    <input
                      ref={inputRef}
                      value={pw}
                      onChange={(e) => {
                        setPw(e.target.value);
                        setPwWrong(false);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") unlock();
                      }}
                      type="password"
                      placeholder="Enter password..."
                      aria-label="Link password"
                      aria-invalid={pwWrong}
                      autoFocus
                      autoComplete="off"
                      className="kz-mono h-10 w-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                    />
                    {pw && (
                      <button
                        type="button"
                        onClick={() => {
                          setPw("");
                          setPwWrong(false);
                          inputRef.current?.focus();
                        }}
                        className="kz-ghost-btn shrink-0 rounded-lg p-1.5"
                        aria-label="Clear password"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={unlock}
                      disabled={pw.trim().length === 0 || unlocking}
                      className="kz-cta flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {unlocking ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Unlocking…
                        </>
                      ) : (
                        <>
                          Unlock
                          <ArrowRight className="h-3.5 w-3.5" />
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bottom strip inside card */}
                  <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                    {pwWrong ? (
                      <span className="kz-mono text-[11.5px] text-[var(--kz-coral)]">
                        Wrong password — try again
                      </span>
                    ) : (
                      <span className="kz-mono flex items-center gap-1.5 text-[11.5px] text-[var(--kz-smoke)]">
                        <Lock className="h-3 w-3 text-[var(--kz-coral)]" />
                        koza.click/<span className="text-[var(--kz-ash)]">{cleanSlug}</span>
                      </span>
                    )}
                    <span className="kz-mono hidden items-center gap-1.5 text-[11px] text-[var(--kz-smoke)] sm:inline-flex">
                      <Kbd>Enter ↵</Kbd> to unlock
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── UNLOCKED / REDIRECTING ────────────────────────── */}
            {state === "unlocked" && unlockedUrl && (
              <motion.div
                key="unlocked"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                className="kz-edge overflow-hidden pb-2.5"
              >
                <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-[var(--kz-hairline)] bg-white/[0.02] px-4 py-2">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                      <Check className="h-4 w-4" strokeWidth={2.5} />
                    </span>
                    <span className="kz-mono truncate text-[14px] text-[var(--kz-mist)]">
                      {hostOf(unlockedUrl)}
                    </span>
                  </div>
                  <span className="kz-mono text-[11px] text-emerald-400">opening…</span>
                </div>
                <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                  <span className="kz-mono truncate text-[11.5px] text-[var(--kz-smoke)]">
                    {unlockedUrl}
                  </span>
                </div>
              </motion.div>
            )}

            {/* ── 404 MISSING (Clean inline card) ───────────────── */}
            {state === "missing" && (
              <motion.div
                key="missing"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="kz-edge overflow-hidden pb-2.5"
              >
                <div className="flex min-h-[56px] items-center justify-between gap-3 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4">
                  <p className="kz-mono min-w-0 truncate text-[15px]">
                    <span className="text-[var(--kz-smoke)]">koza.click/</span>
                    <span className="text-[var(--kz-coral)]">{cleanSlug}</span>
                  </p>
                  <a
                    href="/"
                    className="kz-cta flex h-10 shrink-0 items-center gap-1.5 rounded-[9px] px-4 text-[13px]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New link
                  </a>
                </div>
                <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                  <span className="kz-mono text-[11.5px] text-[var(--kz-smoke)]">
                    This short link does not exist or was removed
                  </span>
                  <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">404</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <KozaFooter />
    </div>
  );
}
