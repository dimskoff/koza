// SPDX-License-Identifier: MPL-2.0
"use client";

import { getSite } from "@/lib/site";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Ban, Check, Info, KeyRound, Loader2, Lock, Plus, X } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import { KozaFooter, KozaNav } from "./Sections";
import { hostOf } from "./lib";

/* what the server decided for this visitor (see POST /links/{slug}/resolve) */
export type LinkDecision =
  | { type: "redirect"; url: string }
  | { type: "password"; wrong?: boolean }
  | { type: "notice"; text: string; url: string }
  | { type: "block"; text?: string };

type GateState = "loading" | "missing" | "locked" | "notice" | "blocked" | "unlocked";

const accent = "bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent";

const HEADLINE: Record<GateState, [string, string]> = {
  loading: ["Opening", "link"],
  missing: ["Link not", "found"],
  locked: ["Protected", "link"],
  notice: ["Before you", "go"],
  blocked: ["Access", "restricted"],
  unlocked: ["Redirecting", "now"],
};

export function LinkGate({
  slug,
  initial,
  query = "",
  referrer = "",
}: {
  slug: string;
  /** decision already made on the server, or "missing"; undefined → ask from the client */
  initial?: LinkDecision | "missing";
  /** the visitor's ?query and Referer, so rules see the real ones */
  query?: string;
  referrer?: string;
}) {
  const cleanSlug = slug.trim().toLowerCase();
  /* when the server already decided, render that state straight away (also
     in the server HTML) — no loading placeholder, no flash */
  const [state, setState] = useState<GateState>(() =>
    initial === "missing"
      ? "missing"
      : initial?.type === "notice"
        ? "notice"
        : initial?.type === "block"
          ? "blocked"
          : initial?.type === "password"
            ? "locked"
            : "loading",
  );
  const [notice, setNotice] = useState<{ text: string; url: string } | null>(() =>
    initial && initial !== "missing" && initial.type === "notice"
      ? { text: initial.text, url: initial.url }
      : null,
  );
  const [blockText, setBlockText] = useState(() =>
    initial && initial !== "missing" && initial.type === "block" ? initial.text || "" : "",
  );
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(
    Boolean(initial && initial !== "missing" && initial.type === "password" && initial.wrong),
  );
  const [unlocking, setUnlocking] = useState(false);
  const [targetUrl, setTargetUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const go = (url: string) => {
    setTargetUrl(url);
    setState("unlocked");
    window.location.replace(url);
  };

  const apply = (d: LinkDecision | "missing") => {
    if (d === "missing") return setState("missing");
    if (d.type === "redirect") return go(d.url);
    if (d.type === "notice") {
      setNotice({ text: d.text, url: d.url });
      return setState("notice");
    }
    if (d.type === "block") {
      setBlockText(d.text || "");
      return setState("blocked");
    }
    setState("locked");
    if (d.wrong) {
      setPwWrong(true);
      inputRef.current?.focus();
    }
  };

  const resolve = async (password?: string): Promise<LinkDecision | "missing"> => {
    const r = await fetch(`/api/v1/links/${encodeURIComponent(cleanSlug)}/resolve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, referrer, ...(password ? { password } : {}) }),
      cache: "no-store",
    });
    if (r.status === 404) return "missing";
    if (!r.ok) throw new Error(String(r.status));
    return ((await r.json()) as { decision: LinkDecision }).decision;
  };

  /* apply the server's decision, or ask for one if SSR couldn't */
  useEffect(() => {
    let alive = true;
    const t = window.setTimeout(() => {
      if (initial) {
        /* only a redirect still needs doing; other states rendered already */
        if (initial !== "missing" && initial.type === "redirect") apply(initial);
        return;
      }
      resolve()
        .then((d) => alive && apply(d))
        .catch(() => alive && setState("missing"));
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, []);

  const unlock = () => {
    if (!pw.trim() || unlocking) return;
    setUnlocking(true);
    setPwWrong(false);
    resolve(pw)
      .then(apply)
      .catch(() => setPwWrong(true))
      .finally(() => setUnlocking(false));
  };

  const [h1, h2] = HEADLINE[state];

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
          {h1} <span className={accent}>{h2}</span>.
        </h1>

        <div className="mt-8 w-full max-w-xl">
          <AnimatePresence mode="wait" initial={false}>
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

            {/* ── PASSWORD ─────────────────────────────────────── */}
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
                      ? { boxShadow: "0 0 0 1px rgba(255,99,99,0.55), 0 12px 36px rgba(0,0,0,0.45)" }
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
                  <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                    {pwWrong ? (
                      <span className="kz-mono text-[11.5px] text-[var(--kz-coral)]">
                        Wrong password — try again
                      </span>
                    ) : (
                      <span className="kz-mono flex items-center gap-1.5 text-[11.5px] text-[var(--kz-smoke)]">
                        <Lock className="h-3 w-3 text-[var(--kz-coral)]" />
                        {getSite().host}/<span className="text-[var(--kz-ash)]">{cleanSlug}</span>
                      </span>
                    )}
                    <span className="kz-mono hidden items-center gap-1.5 text-[11px] text-[var(--kz-smoke)] sm:inline-flex">
                      <Kbd>Enter ↵</Kbd> to unlock
                    </span>
                  </div>
                </motion.div>
              </motion.div>
            )}

            {/* ── NOTICE: the owner's message, then Continue ───── */}
            {state === "notice" && notice && (
              <motion.div
                key="notice"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="kz-edge overflow-hidden"
              >
                <div className="flex gap-3 px-5 py-5">
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04]">
                    <Info className="h-4 w-4 text-[var(--kz-coral)]" />
                  </span>
                  <p className="min-w-0 whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-[var(--kz-mist)]">
                    {notice.text}
                  </p>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4">
                  <span className="kz-mono min-w-0 truncate text-[11.5px] text-[var(--kz-smoke)]">
                    continues to <span className="text-[var(--kz-ash)]">{hostOf(notice.url)}</span>
                  </span>
                  <button
                    type="button"
                    autoFocus
                    onClick={() => go(notice.url)}
                    className="kz-cta flex h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-[9px] px-4 text-[13px]"
                  >
                    Continue <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── BLOCKED ──────────────────────────────────────── */}
            {state === "blocked" && (
              <motion.div
                key="blocked"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="kz-edge overflow-hidden pb-2.5"
              >
                <div className="flex min-h-[56px] items-center gap-3 border-b border-[var(--kz-hairline)] bg-white/[0.02] px-4 py-3">
                  <Ban className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
                  <p className="min-w-0 whitespace-pre-wrap break-words text-[14px] text-[var(--kz-mist)]">
                    {blockText || "This link isn't available to you."}
                  </p>
                </div>
                <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                  <span className="kz-mono text-[11.5px] text-[var(--kz-smoke)]">
                    {getSite().host}/<span className="text-[var(--kz-ash)]">{cleanSlug}</span>
                  </span>
                  <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">blocked by the link owner</span>
                </div>
              </motion.div>
            )}

            {/* ── REDIRECTING ──────────────────────────────────── */}
            {state === "unlocked" && targetUrl && (
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
                      {hostOf(targetUrl)}
                    </span>
                  </div>
                  <span className="kz-mono text-[11px] text-emerald-400">opening…</span>
                </div>
                <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
                  <span className="kz-mono truncate text-[11.5px] text-[var(--kz-smoke)]">{targetUrl}</span>
                </div>
              </motion.div>
            )}

            {/* ── 404 ──────────────────────────────────────────── */}
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
                    <span className="text-[var(--kz-smoke)]">{getSite().host}/</span>
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
