// SPDX-License-Identifier: MPL-2.0
"use client";

import { getSite } from "@/lib/site";
import { useEffect, useState, useSyncExternalStore } from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { Copy, ExternalLink, Lock, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { KozaQr } from "./QrCode";
import {
  type KozaLink,
  getLinksSnapshot,
  getServerLinks,
  hostOf,
  isWebUrl,
  removeLink,
  shortUrlOf,
  subscribeLinks,
  syncClicks,
  timeAgo,
} from "./lib";

const SYNC_LIMIT = 20;

function FaviconAvatar({ url }: { url: string }) {
  const host = hostOf(url);
  const letter = (host.charAt(0) || "?").toUpperCase();
  const faviconUrl =
    host && isWebUrl(url)
      ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`
      : undefined;

  return (
    <Avatar className="h-8 w-8 shrink-0 rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04] p-1.5">
      {faviconUrl && (
        <AvatarImage
          src={faviconUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="rounded-xs object-contain"
        />
      )}
      <AvatarFallback className="kz-mono rounded-none bg-transparent text-xs uppercase text-[var(--kz-coral)]">
        {letter}
      </AvatarFallback>
    </Avatar>
  );
}

export function RecentLinks() {
  const links = useSyncExternalStore(subscribeLinks, getLinksSnapshot, getServerLinks);
  const [qrLink, setQrLink] = useState<KozaLink | null>(null);

  /* The list only exists in localStorage, so it shows up right after
     hydration. The first batch cascades in; links added later slide in alone. */
  const [cascade, setCascade] = useState(true);
  const hasLinks = links.length > 0;
  useEffect(() => {
    if (!hasLinks) return;
    const t = window.setTimeout(() => setCascade(false), 700);
    return () => window.clearTimeout(t);
  }, [hasLinks]);

  /* Keyed by slug list so click-count updates do NOT re-trigger the fetch in a loop */
  const slugsKey = links.map((l) => l.slug).join(",");

  /* Refresh click counts for the links THIS browser created — one lookup per
     slug. There is deliberately no public "list every link" endpoint. */
  useEffect(() => {
    if (!slugsKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 6000);
    const current = getLinksSnapshot().slice(0, SYNC_LIMIT);
    void Promise.all(
      current.map(async (l) => {
        try {
          const r = await fetch(`/api/v1/links/${encodeURIComponent(l.slug)}`, {
            cache: "no-store",
            signal: controller.signal,
          });
          if (!r.ok) return;
          const d = (await r.json()) as { link?: { clicks?: number } };
          const c = d.link?.clicks;
          if (typeof c === "number" && c !== l.clicks) syncClicks(l.id, c);
        } catch {
          /* offline or aborted — keep the local count */
        }
      }),
    ).finally(() => window.clearTimeout(timer));
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [slugsKey]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const open = (link: KozaLink) => {
    window.open(shortUrlOf(link.slug), "_blank", "noopener,noreferrer");
  };

  if (links.length === 0) return null;

  return (
    <MotionConfig reducedMotion="user">
    <motion.section
      aria-label="Your links, local to this browser"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="kz-edge kz-scroll max-h-44 overflow-y-auto sm:max-h-52">
        <ul className="divide-y divide-[var(--kz-hairline)]" aria-label="Saved short links">
          <AnimatePresence initial={true}>
          {links.map((link, i) => (
            <motion.li
              key={link.id}
              layout="position"
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, x: -12, transition: { duration: 0.18 } }}
              transition={{
                duration: 0.32,
                ease: [0.22, 1, 0.36, 1],
                delay: cascade ? 0.06 + Math.min(i, 5) * 0.055 : 0,
              }}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
            >
              <FaviconAvatar url={link.url} />

              <button
                type="button"
                onClick={() => copy(shortUrlOf(link.slug), "Link")}
                className="min-w-0 flex-1 cursor-pointer text-left"
                title="Click to copy link"
              >
                <div className="flex items-center gap-1.5">
                  <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">
                    {getSite().host}/<span className="text-[var(--kz-coral)]">{link.slug}</span>
                  </p>
                  {link.locked && (
                    <Lock className="h-3 w-3 shrink-0 text-[var(--kz-coral)]" />
                  )}
                </div>
                <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-smoke)]">
                  {hostOf(link.url)} · {timeAgo(link.createdAt)} · {link.clicks} clicks
                </p>
              </button>

              <div className="flex shrink-0 items-center gap-0.5 opacity-65 transition-opacity group-hover:opacity-100">
                <IconBtn
                  label="Copy short link"
                  onClick={() => copy(shortUrlOf(link.slug), "Link")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Show QR code" onClick={() => setQrLink(link)}>
                  <QrCode className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn label="Open destination" onClick={() => open(link)}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </IconBtn>
                <IconBtn
                  label="Remove from this list"
                  onClick={() => {
                    removeLink(link.id);
                    toast("Removed from your list", {
                      description: `the short link itself stays live on ${getSite().host}`,
                    });
                  }}
                  danger
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </motion.li>
          ))}
          </AnimatePresence>
        </ul>
      </div>
    </motion.section>

      {/* QR modal — outside the animated section: a transformed ancestor would
          trap position:fixed inside it */}
      <AnimatePresence>
        {qrLink && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setQrLink(null)}
            role="dialog"
            aria-modal="true"
            aria-label="QR code"
          >
            <motion.div
              initial={{ scale: 0.94, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
              className="kz-key w-full max-w-xs p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                Scan to open
              </p>
              <div className="mt-5 flex justify-center rounded-xl bg-[#0e0f11] p-5 ring-1 ring-white/10">
                <KozaQr value={shortUrlOf(qrLink.slug)} size={196} />
              </div>
              <p className="kz-mono mt-4 truncate text-center text-xs text-[var(--kz-ash)]">
                {getSite().host}/<span className="text-[var(--kz-coral)]">{qrLink.slug}</span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className={`cursor-pointer rounded-lg p-2 transition-colors ${
        danger
          ? "text-[var(--kz-ash)] hover:bg-red-500/10 hover:text-red-400"
          : "text-[var(--kz-ash)] hover:bg-white/[0.06] hover:text-[var(--kz-mist)]"
      }`}
    >
      {children}
    </button>
  );
}
