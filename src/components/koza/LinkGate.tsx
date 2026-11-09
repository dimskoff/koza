// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, ArrowRight, KeyRound, Lock, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { KozaFooter, KozaNav } from "./Sections";
import {
  bumpClicks,
  getLinksSnapshot,
  getServerLinks,
  hostOf,
  subscribeLinks,
} from "./lib";

type GateState = "loading" | "missing" | "locked" | "jump" | "unlocked";

type ServerProbe =
  | { status: "checking" }
  | { status: "none" }
  | { status: "found"; url: string | null; password: boolean };

const UNLOCK_BEAT_MS = 650;
const emptySubscribe = () => () => {};

export function LinkGate({ slug }: { slug: string }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const links = useSyncExternalStore(subscribeLinks, getLinksSnapshot, getServerLinks);
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [unlockedUrl, setUnlockedUrl] = useState<string | null>(null);
  const [server, setServer] = useState<ServerProbe>({ status: "checking" });
  const probed = useRef(false);

  const link = useMemo(
    () => links.find((l) => l.slug === slug.toLowerCase()) ?? null,
    [links, slug],
  );

  /* Probe the server for this slug so locked status & URL come from the authoritative backend */
  useEffect(() => {
    if (!mounted || probed.current) return;
    probed.current = true;
    let alive = true;
    fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            link?: { url?: string | null; password?: boolean };
          } | null,
        ) => {
          if (!alive) return;
          if (data?.link) {
            setServer({
              status: "found",
              url: data.link.url ?? null,
              password: Boolean(data.link.password),
            });
          } else if (link && !link.locked) {
            setServer({
              status: "found",
              url: link.url,
              password: false,
            });
          } else {
            setServer({ status: "none" });
          }
        },
      )
      .catch(() => {
        if (alive) {
          if (link && !link.locked) {
            setServer({ status: "found", url: link.url, password: false });
          } else {
            setServer({ status: "none" });
          }
        }
      });
    return () => {
      alive = false;
    };
  }, [mounted, link, slug]);

  const serverLink = server.status === "found" ? server : null;
  const hasPw = Boolean(serverLink?.password || link?.locked);

  const state: GateState = !mounted
    ? "loading"
    : server.status === "checking"
      ? "loading"
      : server.status === "none"
        ? "missing"
        : hasPw
          ? unlockedUrl
            ? "unlocked"
            : "locked"
          : "jump";

  const target = unlockedUrl ?? serverLink?.url ?? link?.url ?? null;
  const linkId = link?.id;

  useEffect(() => {
    if ((state !== "jump" && state !== "unlocked") || !target) return;
    if (linkId) {
      bumpClicks(linkId);
    }
    try {
      void fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/hit`, {
        method: "POST",
        keepalive: true,
      });
    } catch {
      /* best-effort */
    }
    if (!hasPw) {
      window.location.replace(target);
      return;
    }
    const t = window.setTimeout(() => window.location.replace(target), UNLOCK_BEAT_MS);
    return () => window.clearTimeout(t);
  }, [state, target, linkId, hasPw, slug]);

  const unlock = () => {
    if (!pw.trim() || unlocking) return;
    setUnlocking(true);
    fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/unlock`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    })
      .then(async (r) => {
        if (r.status === 200) {
          const d = (await r.json()) as { url?: string };
          if (d.url) {
            setPwWrong(false);
            setUnlockedUrl(d.url);
            return;
          }
        }
        setPwWrong(true);
      })
      .catch(() => setPwWrong(true))
      .finally(() => setUnlocking(false));
  };

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />
      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <AnimatePresence mode="wait" initial={false}>
          {/* ── resolving beat ─────────────────────────────────── */}
          {state === "loading" && (
            <motion.div
              key="loading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4"
            >
              <Badge variant="secondary">resolving link…</Badge>
              <span className="h-1 w-40 overflow-hidden rounded-full bg-white/[0.07]">
                <span className="kz-fill block h-full w-full rounded-full bg-[var(--kz-coral)]" />
              </span>
            </motion.div>
          )}

          {/* ── password cleared → one quick beat, then gone ───── */}
          {state === "unlocked" && target && (
            <motion.div
              key="unlocked"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="kz-key w-full max-w-md px-6 py-7 text-center"
            >
              <motion.div
                initial={{ scale: 0.4, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 420, damping: 20 }}
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 shadow-[0_0_28px_rgba(16,185,129,0.3)]"
                aria-hidden="true"
              >
                <ShieldCheck className="h-6 w-6" />
              </motion.div>
              <div className="mt-4 flex justify-center">
                <Badge variant="emerald">Unlocked · Redirecting</Badge>
              </div>
              <p className="kz-mono mt-3 truncate text-[13px] text-[var(--kz-ash)]">
                <span className="text-[var(--kz-smoke)]">koza.click/</span>
                <span className="text-[var(--kz-coral)]">{slug.toLowerCase()}</span> →{" "}
                {hostOf(target)}
              </p>
              <span className="mt-5 block h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className="kz-fill block h-full w-full rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]"
                  style={{ animationDuration: `${UNLOCK_BEAT_MS}ms` }}
                />
              </span>
            </motion.div>
          )}

          {/* ── password gate ──────────────────────────────────── */}
          {state === "locked" && (
            <motion.div
              key="locked"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="kz-key w-full max-w-md px-6 py-7"
            >
              <div className="flex flex-col items-center text-center">
                <span
                  className="relative flex h-12 w-12 items-center justify-center rounded-xl border border-[rgba(255,99,99,0.4)] bg-[rgba(255,99,99,0.08)]"
                  aria-hidden="true"
                >
                  <Lock className="h-5 w-5 text-[var(--kz-coral)]" />
                </span>
                <Badge variant="coral" className="mt-4">
                  Password Protected
                </Badge>
                <p className="mt-2.5 text-[17px] font-medium text-[var(--kz-mist)]">
                  This short link is locked
                </p>
                <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
                  koza.click/<span className="text-[var(--kz-coral)]">{slug.toLowerCase()}</span>{" "}
                  requires a password to unlock
                </p>
              </div>

              <motion.div
                animate={pwWrong ? { x: [0, -8, 8, -6, 6, -2, 0] } : { x: 0 }}
                transition={{ duration: 0.42 }}
                className="mt-5"
              >
                <div
                  className="kz-inset flex items-center gap-2.5 px-4 py-3"
                  style={
                    pwWrong
                      ? {
                          boxShadow:
                            "inset 0 0 0 1px rgba(255,99,99,0.7), inset 0 1px 2px rgba(0,0,0,0.35)",
                        }
                      : undefined
                  }
                >
                  <KeyRound className="h-4 w-4 shrink-0 text-[var(--kz-coral)]" />
                  <input
                    value={pw}
                    onChange={(e) => {
                      setPw(e.target.value);
                      setPwWrong(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") unlock();
                    }}
                    type="password"
                    placeholder="enter the password"
                    aria-label="Link password"
                    aria-invalid={pwWrong}
                    autoFocus
                    autoComplete="off"
                    className="kz-mono w-full min-w-0 bg-transparent text-[14px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                  />
                </div>
                {pwWrong && (
                  <Alert variant="destructive" className="mt-3 py-2.5">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-xs">Incorrect password</AlertTitle>
                    <AlertDescription className="text-[11px]">
                      Please check the password and try again.
                    </AlertDescription>
                  </Alert>
                )}
                <button
                  onClick={unlock}
                  disabled={pw.length === 0 || unlocking}
                  className="kz-cta mt-3.5 flex h-12 w-full cursor-pointer items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {unlocking ? "Verifying…" : "Unlock and continue"}{" "}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>

              <p className="kz-mono mt-4 text-center text-[10.5px] text-[var(--kz-smoke)]">
                verified with salted scrypt on koza.click
              </p>
            </motion.div>
          )}

          {/* ── dead link ──────────────────────────────────────── */}
          {state === "missing" && (
            <motion.div
              key="missing"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="kz-key w-full max-w-md px-6 py-8 text-center"
            >
              <Badge variant="destructive">404 · Not Found</Badge>
              <p className="kz-mono mt-3 text-[18px] tracking-tight">
                <span className="text-[var(--kz-smoke)]">koza.click/</span>
                <span className="text-[var(--kz-coral)]">{slug}</span>
              </p>
              <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--kz-ash)]">
                This short link does not exist or has been removed from the server.
              </p>
              <a
                href="/"
                className="kz-cta mt-5 inline-flex h-11 items-center gap-2 px-5 text-sm"
              >
                Create a short link <ArrowRight className="h-4 w-4" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <KozaFooter />
    </div>
  );
}
