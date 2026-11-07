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
  Plus,
  QrCode,
  Sparkles,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { KozaQr } from "./QrCode";
import {
  type KozaLink,
  isSlugTaken,
  normalizeUrl,
  randomSlug,
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
        description: "Try something like claude.ai/chat",
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
      link?: { slug: string; url: string; clicks?: number; created_at?: string };
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
      url: data.link.url,
      password: pw || undefined,
      clicks: data.link.clicks ?? 0,
      createdAt: Date.parse(data.link.created_at ?? "") || Date.now(),
    };
    saveLink(link);
    setResult(link);
    setPhase("done");
    toast.success("Link is live", {
      description: shortUrlOf(link.slug),
    });
  }, [phase, destination, slugTrimmed, baseError, taken, passwordOn, password]);

  /* "Press / to focus" + Cmd/Ctrl+Enter — a small power-tool touch */
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
        inputRef.current?.focus();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void shorten();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shorten]);

  useEffect(
    () => () => {
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  /* through the short link itself so the click counts where it should */
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

  /* the big link surface doubles as the copy button */
  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(shortUrlOf(result.slug));
      setCopied(true);
      if (copiedTimer.current !== null) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const working = phase === "working";

  return (
    <div className="relative mx-auto w-full max-w-2xl">
      {/* ── one card — button inside the input, options row under it ── */}
      <div className="kz-edge relative overflow-hidden p-2">
        {/* input row — the coral button lives right inside the field */}
        <div className="kz-inset flex items-center gap-2 p-2 pl-4">
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
            placeholder="Paste a link — google.com"
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
            whileHover={working ? undefined : { scale: 1.03 }}
            whileTap={working ? undefined : { scale: 0.94, y: 1 }}
            transition={{ type: "spring", stiffness: 520, damping: 24 }}
            className="kz-cta relative flex h-10 shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-[9px] px-4 text-[13px] disabled:cursor-not-allowed disabled:opacity-80"
          >
            {/* shimmer sweep while working */}
            {working && (
              <span
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
              >
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
        </div>

        {/* options row — same card, right under the field */}
        <div className="flex items-center justify-between px-4 pb-1 pt-3">
          <button
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="kz-mono flex items-center gap-2 text-xs text-[var(--kz-ash)] transition-colors hover:text-[var(--kz-mist)]"
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
          <span className="kz-mono hidden text-[11px] text-[var(--kz-smoke)] md:block">
            press{" "}
            <kbd className="rounded-md border border-[var(--kz-hairline)] bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-[var(--kz-ash)]">
              /
            </kbd>{" "}
            to focus
          </span>
        </div>

        {/* Advanced options — unfold inside the same card */}
        <AnimatePresence initial={false}>
          {advancedOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="grid gap-3 px-4 pb-4 pt-2 sm:grid-cols-2">
                {/* Custom slug */}
                <div>
                  <label
                    htmlFor="kz-slug"
                    className="kz-mono mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]"
                  >
                    Custom name
                  </label>
                  <div className="kz-inset flex items-center gap-1 px-3 py-2.5">
                    <span
                      className="kz-mono shrink-0 text-[13px] text-[var(--kz-smoke)]"
                      aria-hidden="true"
                    >
                      /
                    </span>
                    <input
                      id="kz-slug"
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="google"
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
                    Password
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
                        className="kz-mono shrink-0 text-[10px] uppercase tracking-wider text-[var(--kz-ash)] hover:text-[var(--kz-mist)]"
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
                      className="kz-inset flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] text-[var(--kz-smoke)] transition-colors hover:text-[var(--kz-ash)]"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                      Protect with a password
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Result panel — height settles first, then the slug cascades ── */}
      <AnimatePresence initial={false}>
        {phase === "done" && result && (
          <motion.div
            key="result"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}
            className="overflow-hidden"
          >
            {/* padding (not margin) so the height measurement stays stable */}
            <div className="pt-4">
              <div
                className="kz-key relative px-5 py-5 sm:px-6"
                role="region"
                aria-label="Shortened link result"
              >
                {/* coral top hairline glow */}
                <div
                  className="absolute inset-x-0 top-0 h-px"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, rgba(255,99,99,0.7), transparent)",
                  }}
                  aria-hidden="true"
                />

                {/* status row */}
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <p className="kz-mono flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                      <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                        <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      </span>
                      your link is live
                    </p>
                    {result.password && (
                      <span className="kz-chip kz-mono flex items-center gap-1.5 px-2.5 py-1 text-[10px] uppercase tracking-wider text-[var(--kz-ash)]">
                        <KeyRound className="h-3 w-3 text-[var(--kz-coral)]" /> locked
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => setQrOpen(true)}
                    className="kz-ghost-btn rounded-lg p-1.5"
                    aria-label="Show QR code"
                    title="QR code"
                  >
                    <QrCode className="h-4 w-4" />
                  </button>
                </div>

                {/* the star — host whispered above, slug huge below */}
                <div className="mt-4">
                  <p className="kz-mono text-[12.5px] tracking-tight text-[var(--kz-smoke)]">
                    koza.click/
                  </p>
                  <p
                    className="kz-mono mt-1 truncate text-[30px] font-medium leading-none tracking-tight sm:text-[34px]"
                    aria-label={`Short link slug ${result.slug}`}
                  >
                    <span className="text-[var(--kz-coral)] [text-shadow:0_0_30px_rgba(255,99,99,0.35)]">
                      {result.slug.split("").map((ch, i) => (
                        <motion.span
                          key={`${result.id}-${i}`}
                          className="inline-block"
                          initial={{ y: 14, opacity: 0 }}
                          animate={{ y: 0, opacity: 1 }}
                          transition={{
                            /* wait for the panel to settle, then cascade — no mid-layout fighting */
                            delay: 0.34 + i * (result.slug.length > 12 ? 0.016 : 0.035),
                            type: "spring",
                            stiffness: 460,
                            damping: 30,
                          }}
                        >
                          {ch}
                        </motion.span>
                      ))}
                    </span>
                  </p>
                </div>

                {/* actions — two honest buttons */}
                <div className="mt-4 flex gap-2.5">
                  <button
                    onClick={copyLink}
                    className="kz-cta flex h-12 flex-1 items-center justify-center gap-2 text-sm"
                    aria-live="polite"
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span
                        key={copied ? "copied" : "copy"}
                        className="flex items-center gap-2"
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.16 }}
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" strokeWidth={2.5} /> Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" /> Copy link
                          </>
                        )}
                      </motion.span>
                    </AnimatePresence>
                  </button>
                  <button
                    onClick={openResult}
                    className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[10px] border border-[var(--kz-hairline-strong)] text-sm font-medium text-[var(--kz-mist)] transition-colors hover:bg-white/[0.05]"
                  >
                    <ArrowUpRight className="h-4 w-4 text-[var(--kz-coral)]" /> Open
                  </button>
                </div>

                {/* destination — the whole row opens the target */}
                <button
                  onClick={openResult}
                  className="group mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left"
                  title="Open destination"
                >
                  <ArrowRight
                    className="h-3.5 w-3.5 shrink-0 text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-coral)]"
                    aria-hidden="true"
                  />
                  <span className="kz-mono truncate text-[12px] text-[var(--kz-smoke)] transition-colors group-hover:text-[var(--kz-ash)]">
                    {result.url}
                  </span>
                </button>

                {/* footer */}
                <div className="kz-hairline-t mt-4 flex items-center justify-between pt-3.5">
                  <button
                    onClick={reset}
                    className="kz-mono flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)] transition-colors hover:text-[var(--kz-mist)]"
                  >
                    <Plus className="h-3.5 w-3.5" /> New link
                  </button>
                  <span className="kz-mono text-[10.5px] text-[var(--kz-smoke)]">
                    live on the server · redirects for everyone
                  </span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
                className="kz-neutral-btn mt-4 flex h-10 w-full items-center justify-center gap-2 text-[13px]"
              >
                <Check className="h-4 w-4" /> Copy link
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
