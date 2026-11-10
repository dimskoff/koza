// SPDX-License-Identifier: MPL-2.0
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ArrowUpRight,
  AtSign,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Lock,
  Plus,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Kbd } from "@/components/ui/kbd";
import { KozaQr } from "./QrCode";
import {
  type KozaLink,
  isSlugTaken,
  normalizeUrl,
  saveLink,
  shortUrlOf,
  slugError,
} from "./lib";

type Phase = "idle" | "working" | "done";

export function Shortener() {
  const [destination, setDestination] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [slug, setSlug] = useState("");
  const [passwordOn, setPasswordOn] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [result, setResult] = useState<KozaLink | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const copiedTimer = useRef<number | null>(null);

  const slugTrimmed = slug.trim().toLowerCase();
  const baseError = slugError(slugTrimmed);
  const taken = slugTrimmed.length > 0 && !baseError && isSlugTaken(slugTrimmed);
  const slugStatus = baseError
    ? { kind: "error" as const, text: baseError }
    : taken
      ? { kind: "error" as const, text: "Already in your links" }
      : slugTrimmed.length > 0
        ? { kind: "ok" as const, text: "koza.click name available" }
        : null;

  /* mint the link on the koza backend — persistent, redirects for everyone */
  const shorten = useCallback(async () => {
    if (phase !== "idle") return;
    const normalized = normalizeUrl(destination);
    if (!normalized) {
      toast.error("That doesn't look like a URL", {
        description: "Try something like google.com",
      });
      return;
    }
    if (slugTrimmed && (baseError || taken)) {
      toast.error("Pick another name for the link");
      return;
    }
    const pw = passwordOn ? password.trim() : "";
    if (pw && pw.length < 4) {
      toast.error("Password is too short", {
        description: "Use at least 4 characters",
      });
      return;
    }

    setPhase("working");
    let data: {
      link?: {
        slug: string;
        url: string | null;
        password?: boolean;
        clicks?: number;
        created_at?: string;
      };
      error?: string;
    } | null = null;
    try {
      const r = await fetch("/api/v1/shorten", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          url: normalized,
          ...(slugTrimmed ? { slug: slugTrimmed } : {}),
          ...(pw ? { password: pw } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      data = await r.json().catch(() => null);
      if (!r.ok || !data?.link) {
        toast.error("Could not shorten that link", {
          description: data?.error ?? "the koza api didn't answer — try again in a moment",
        });
        setPhase("idle");
        return;
      }
    } catch {
      toast.error("Could not shorten that link", {
        description: "network trouble — try again in a moment",
      });
      setPhase("idle");
      return;
    }

    const link: KozaLink = {
      id: data.link.slug,
      slug: data.link.slug,
      url: data.link.url || normalized,
      locked: Boolean(pw || data.link.password),
      clicks: data.link.clicks ?? 0,
      createdAt: Date.parse(data.link.created_at ?? "") || Date.now(),
    };
    saveLink(link);
    setResult(link);
    setAdvancedOpen(false);
    setPhase("done");

    try {
      await navigator.clipboard.writeText(shortUrlOf(link.slug));
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 2000);
      toast.success("Link copied", {
        description: shortUrlOf(link.slug),
      });
    } catch {
      toast.success("Link created", {
        description: shortUrlOf(link.slug),
      });
    }
  }, [phase, destination, slugTrimmed, baseError, taken, passwordOn, password]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "/" && !typing) {
        e.preventDefault();
        if (phase === "done") {
          reset();
        } else {
          inputRef.current?.focus();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void shorten();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shorten, phase]);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const openResult = () => {
    if (!result) return;
    window.open(shortUrlOf(result.slug), "_blank", "noopener,noreferrer");
  };

  const reset = () => {
    setResult(null);
    setDestination("");
    setSlug("");
    setPassword("");
    setPasswordOn(false);
    setAdvancedOpen(false);
    setPhase("idle");
    setCopied(false);
    window.setTimeout(() => inputRef.current?.focus(), 60);
  };

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(shortUrlOf(result.slug));
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1800);
      toast.success("Link copied");
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const working = phase === "working";
  const isDone = phase === "done" && result !== null;

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      <div className="kz-edge relative overflow-hidden pb-2.5 transition-shadow duration-300">
        {isDone && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="pointer-events-none absolute inset-x-0 top-0 h-px"
            style={{
              background:
                "linear-gradient(90deg, transparent, rgba(255,99,99,0.85), transparent)",
            }}
            aria-hidden="true"
          />
        )}

        {/* ── Main bar: morphs smoothly between URL input and short link ── */}
        <div className="relative flex min-h-[56px] items-center gap-2 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4 transition-colors focus-within:bg-white/[0.04]">
          <AnimatePresence mode="wait" initial={false}>
            {!isDone ? (
              <motion.div
                key="input-mode"
                exit={{ opacity: 0, y: -8, scale: 0.99 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="flex w-full items-center gap-2"
              >
                <input
                  ref={inputRef}
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void shorten();
                  }}
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste a link..."
                  aria-label="Destination URL to shorten"
                  className="kz-mono h-10 w-full min-w-0 flex-1 bg-transparent text-[15px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                />
                {destination && (
                  <button
                    onClick={() => {
                      setDestination("");
                      setSlug("");
                    }}
                    className="kz-ghost-btn shrink-0 rounded-lg p-1.5"
                    aria-label="Clear input"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <motion.button
                  onClick={() => void shorten()}
                  disabled={working}
                  whileHover={working ? undefined : { scale: 1.02 }}
                  whileTap={working ? undefined : { scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 520, damping: 24 }}
                  className="kz-cta relative flex h-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 overflow-hidden rounded-[9px] px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-80"
                >
                  {working && (
                    <span className="pointer-events-none absolute inset-0" aria-hidden="true">
                      <motion.span
                        className="absolute inset-y-0 w-1/2"
                        style={{
                          background:
                            "linear-gradient(100deg, transparent, rgba(255,255,255,0.45), transparent)",
                        }}
                        initial={{ x: "-120%" }}
                        animate={{ x: "340%" }}
                        transition={{ duration: 0.85, repeat: Infinity, ease: "linear" }}
                      />
                    </span>
                  )}
                  {working ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Shortening…
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-3.5 w-3.5" />
                      Shorten link
                    </>
                  )}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="result-mode"
                initial={{ opacity: 0, y: 12, scale: 0.98, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: 10, filter: "blur(4px)" }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex w-full items-center justify-between gap-2"
              >
                {/* Clickable short link inside the input bar */}
                <button
                  onClick={copyLink}
                  className="group flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                  title="Click to copy short link"
                >
                  {result.locked && (
                    <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--kz-coral)]" />
                  )}
                  <span className="kz-mono truncate text-[16px] font-medium tracking-tight">
                    <span className="text-[var(--kz-ash)]">koza.click/</span>
                    <span className="text-[var(--kz-coral)]">
                      {result.slug.split("").map((ch, i) => (
                        <motion.span
                          key={`${result.id}-${i}`}
                          className="inline-block"
                          initial={{ y: 8, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{
                            delay: 0.03 + i * 0.02,
                            type: "spring",
                            stiffness: 480,
                            damping: 26,
                          }}
                        >
                          {ch}
                        </motion.span>
                      ))}
                    </span>
                  </span>
                </button>

                {/* Calm, clean inline actions */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => setQrOpen(true)}
                    className="kz-ghost-btn flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--kz-ash)] hover:bg-white/[0.06] hover:text-[var(--kz-mist)]"
                    aria-label="Show QR code"
                    title="QR code"
                  >
                    <QrCode className="h-4 w-4" />
                  </button>
                  <button
                    onClick={openResult}
                    className="kz-ghost-btn flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-[var(--kz-ash)] hover:bg-white/[0.06] hover:text-[var(--kz-mist)]"
                    aria-label="Open short link"
                    title="Open link"
                  >
                    <ArrowUpRight className="h-4 w-4" />
                  </button>
                  <button
                    onClick={copyLink}
                    className="kz-cta ml-1 flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] px-3.5 text-[12.5px]"
                    aria-live="polite"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Bottom bar inside the card: Advanced options OR destination + New link */}
        <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
          {!isDone ? (
            <>
              <button
                onClick={() => setAdvancedOpen((v) => !v)}
                aria-expanded={advancedOpen}
                className="kz-mono flex cursor-pointer items-center gap-2 text-xs text-[var(--kz-ash)] transition-colors hover:text-[var(--kz-mist)]"
              >
                <AtSign className="h-3.5 w-3.5" />
                Advanced options
                <span
                  className={`text-[10px] transition-transform duration-200 ${advancedOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                >
                  ▾
                </span>
              </button>
              <span className="kz-mono hidden items-center gap-1.5 text-[11px] text-[var(--kz-smoke)] md:inline-flex">
                <Kbd>Enter ↵</Kbd> to shorten
              </span>
            </>
          ) : (
            <div className="flex w-full items-center justify-between gap-3">
              <button
                onClick={openResult}
                className="group flex min-w-0 items-center gap-2 text-left"
                title="Open destination"
              >
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-coral)]" />
                <span className="kz-mono truncate text-[12px] text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-ash)]">
                  {result.url}
                </span>
              </button>
              <button
                onClick={reset}
                className="kz-mono flex shrink-0 cursor-pointer items-center gap-1 text-[11.5px] text-[var(--kz-ash)] transition-colors hover:text-[var(--kz-mist)]"
              >
                <Plus className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
                New link
              </button>
            </div>
          )}
        </div>

        {/* Advanced options — unfold inside the same card */}
        <AnimatePresence initial={false}>
          {advancedOpen && !isDone && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 px-4 pb-3 pt-2.5 sm:grid-cols-2">
                {/* Custom slug */}
                <div>
                  <label
                    htmlFor="kz-slug"
                    className="kz-mono mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]"
                  >
                    Custom slug
                  </label>
                  <div className="kz-inset flex items-center gap-1 px-3 py-2.5">
                    <span
                      className="kz-mono shrink-0 text-[13px] text-[var(--kz-smoke)]"
                      aria-hidden="true"
                    >
                      koza.click/
                    </span>
                    <input
                      id="kz-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="my-link"
                      maxLength={32}
                      spellCheck={false}
                      autoComplete="off"
                      className="kz-mono w-full min-w-0 bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                      aria-describedby="kz-slug-status"
                    />
                  </div>
                  {slugStatus && (
                    <p
                      id="kz-slug-status"
                      role="status"
                      className={`kz-mono mt-1.5 text-[11px] ${slugStatus.kind === "ok" ? "text-emerald-400/80" : "text-[var(--kz-coral)]"}`}
                    >
                      {slugStatus.text}
                    </p>
                  )}
                </div>
                {/* Password */}
                <div>
                  <span className="kz-mono mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                    Password protection
                  </span>
                  {passwordOn ? (
                    <div className="kz-inset flex items-center gap-2 px-3 py-2.5">
                      <input
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        type={showPassword ? "text" : "password"}
                        placeholder="min 4 characters"
                        aria-label="Link password"
                        className="kz-mono w-full min-w-0 bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                      />
                      <button
                        onClick={() => setShowPassword((v) => !v)}
                        className="kz-mono shrink-0 cursor-pointer text-[10px] uppercase tracking-wider text-[var(--kz-ash)] hover:text-[var(--kz-mist)]"
                        aria-pressed={showPassword}
                      >
                        {showPassword ? "Hide" : "Show"}
                      </button>
                      <button
                        onClick={() => {
                          setPasswordOn(false);
                          setPassword("");
                        }}
                        className="kz-ghost-btn shrink-0 rounded-md p-1"
                        aria-label="Remove password"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setPasswordOn(true)}
                      className="kz-inset flex w-full cursor-pointer items-center gap-2 px-3 py-2.5 text-left text-[13px] text-[var(--kz-smoke)] transition-colors hover:text-[var(--kz-ash)]"
                    >
                      <KeyRound className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
                      Protect with a password
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── QR modal ───────────────────────────────────────────── */}
      <AnimatePresence>
        {qrOpen && result && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setQrOpen(false)}
            role="dialog"
            aria-modal="true"
            aria-label="QR code for the short link"
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="kz-key w-full max-w-xs p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between">
                <p className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Scan to open
                </p>
                <button
                  onClick={() => setQrOpen(false)}
                  className="kz-ghost-btn rounded-lg p-1.5"
                  aria-label="Close QR"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-5 flex justify-center rounded-xl bg-[#0e0f11] p-5 ring-1 ring-white/10">
                <KozaQr value={shortUrlOf(result.slug)} size={196} />
              </div>
              <p className="kz-mono mt-4 truncate text-center text-xs text-[var(--kz-ash)]">
                koza.click/<span className="text-[var(--kz-coral)]">{result.slug}</span>
              </p>
              <button
                onClick={() => copy(shortUrlOf(result.slug), "Link")}
                className="kz-neutral-btn mt-4 flex h-10 w-full cursor-pointer items-center justify-center gap-2 text-[13px]"
              >
                <Copy className="h-4 w-4" /> Copy link
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
