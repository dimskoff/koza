"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, KeyRound, Lock } from "lucide-react";
import { KozaFooter, KozaNav } from "./Sections";
import {
  type KozaLink,
  bumpClicks,
  getLinksSnapshot,
  getServerLinks,
  hostOf,
  subscribeLinks,
} from "./lib";

type GateState = "loading" | "missing" | "locked" | "jump" | "unlocked";

/* server-side resolution: links minted through the koza api live on the
   server, so the gate asks once when the browser store comes up empty */
type ServerProbe =
  | { status: "checking" }
  | { status: "none" }
  | { status: "found"; url: string; password: boolean };

/* after a correct password: one short success beat, then go */
const UNLOCK_BEAT_MS = 650;
const emptySubscribe = () => () => {};

export function LinkGate({ slug }: { slug: string }) {
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);
  const links = useSyncExternalStore(subscribeLinks, getLinksSnapshot, getServerLinks);
  const [pw, setPw] = useState("");
  const [pwWrong, setPwWrong] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [server, setServer] = useState<ServerProbe>({ status: "checking" });
  const probed = useRef(false);

  const link = useMemo(
    () => links.find((l) => l.slug === slug.toLowerCase()) ?? null,
    [links, slug],
  );

  /* one shot: ask the api about this slug if the browser doesn't know it */
  useEffect(() => {
    if (!mounted || link || probed.current) return;
    probed.current = true;
    let alive = true;
    fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(
        (
          data: {
            link?: { url?: string; password?: boolean };
          } | null,
        ) => {
          if (!alive) return;
          if (data?.link?.url) {
            setServer({
              status: "found",
              url: data.link.url,
              password: Boolean(data.link.password),
            });
          } else {
            setServer({ status: "none" });
          }
        },
      )
      .catch(() => {
        if (alive) setServer({ status: "none" });
      });
    return () => {
      alive = false;
    };
  }, [mounted, link, slug]);

  const serverLink = server.status === "found" ? server : null;

  const state: GateState = !mounted
    ? "loading"
    : link
      ? link.password
        ? unlocked
          ? "unlocked"
          : "locked"
        : "jump"
      : serverLink
        ? serverLink.password
          ? unlocked
            ? "unlocked"
            : "locked"
          : "jump"
        : server.status === "none"
          ? "missing"
          : "loading";

  const target = link?.url ?? serverLink?.url ?? null;
  const linkId = link?.id;
  const hasPw = Boolean(link?.password) || Boolean(serverLink?.password);

  /* no password → zero ceremony: count the click and replace immediately.
     with password → the gate already let them in, one beat and go. */
  useEffect(() => {
    if ((state !== "jump" && state !== "unlocked") || !target) return;
    if (linkId) {
      bumpClicks(linkId);
    }
    /* count the click on the server too — best effort, both paths */
    try {
      void fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/hit`, {
        method: "POST",
        keepalive: true,
      });
    } catch {
      /* counting is best-effort */
    }
    if (!hasPw) {
      window.location.replace(target);
      return;
    }
    const t = window.setTimeout(() => window.location.replace(target), UNLOCK_BEAT_MS);
    return () => window.clearTimeout(t);
  }, [state, target, linkId, hasPw, slug]);

  const unlock = () => {
    if (link?.password) {
      if (pw === link.password) {
        setPwWrong(false);
        setUnlocked(true);
      } else {
        setPwWrong(true);
      }
      return;
    }
    if (serverLink?.password) {
      fetch(`/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/unlock`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: pw }),
      })
        .then((r) =>
          r.status === 200
            ? r.json().then((d: { url?: string }) => {
                if (d.url) setServer({ status: "found", url: d.url, password: true });
                setPwWrong(false);
                setUnlocked(true);
              })
            : setPwWrong(true),
        )
        .catch(() => setPwWrong(true));
    }
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
              <span className="kz-mono text-[12px] uppercase tracking-wider text-[var(--kz-smoke)]">
                resolving…
              </span>
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
                className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[var(--kz-coral)] shadow-[0_0_28px_rgba(255,99,99,0.4)]"
                aria-hidden="true"
              >
                <UnlockIcon />
              </motion.div>
              <p className="mt-4 text-[16px] font-medium text-[var(--kz-mist)]">Unlocked</p>
              <p className="kz-mono mt-1 truncate text-[13px] text-[var(--kz-ash)]">
                <span className="text-[var(--kz-smoke)]">koza.click/</span>
                <span className="text-[var(--kz-coral)]">{slug.toLowerCase()}</span> ·{" "}
                {hostOf(target)}
              </p>
              <span className="mt-5 block h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
                <span
                  className="kz-fill block h-full w-full rounded-full bg-[var(--kz-coral)] shadow-[0_0_10px_rgba(255,99,99,0.5)]"
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
                <p className="mt-4 text-[16px] font-medium text-[var(--kz-mist)]">
                  This link is locked
                </p>
                <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
                  koza.click/<span className="text-[var(--kz-coral)]">{slug.toLowerCase()}</span>{" "}
                  asks for a password
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
                  <p className="kz-mono mt-2 text-[11px] text-[var(--kz-coral)]">
                    wrong password — try again
                  </p>
                )}
                <button
                  onClick={unlock}
                  disabled={pw.length === 0}
                  className="kz-cta mt-3.5 flex h-12 w-full items-center justify-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Unlock and continue <ArrowRight className="h-4 w-4" />
                </button>
              </motion.div>

              <p className="kz-mono mt-4 text-center text-[10.5px] text-[var(--kz-smoke)]">
                the password never leaves this browser
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
              <p className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                404 · nothing lives here
              </p>
              <p className="kz-mono mt-3 text-[17px] tracking-tight">
                <span className="text-[var(--kz-smoke)]">koza.click/</span>
                <span className="text-[var(--kz-coral)]">{slug}</span>
              </p>
              <p className="mx-auto mt-3 max-w-xs text-[13px] leading-relaxed text-[var(--kz-ash)]">
                koza links live in the browser that made them — or on the api that minted them.
                This one wasn&apos;t born anywhere.
              </p>
              <a
                href="/"
                className="kz-cta mt-5 inline-flex h-11 items-center gap-2 px-5 text-sm"
              >
                Make this link yours <ArrowRight className="h-4 w-4" />
              </a>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
      <KozaFooter />
    </div>
  );
}

function UnlockIcon() {
  return (
    <svg
      className="h-5 w-5 text-[#1a0b0b]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}
