// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, ExternalLink, Lock, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { KozaQr } from "./QrCode";
import {
  type KozaLink,
  getLinksSnapshot,
  getServerLinks,
  hostOf,
  removeLink,
  shortUrlOf,
  subscribeLinks,
  syncClicks,
  timeAgo,
} from "./lib";

function FaviconAvatar({ url }: { url: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  const letter = (host.charAt(0) || "?").toUpperCase();

  return (
    <span
      className="kz-mono flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04] text-sm uppercase text-[var(--kz-coral)]"
      aria-hidden="true"
    >
      {!failed && host && host !== "link" ? (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`}
          alt=""
          width={18}
          height={18}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-4 w-4 rounded-sm object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        letter
      )}
    </span>
  );
}

export function RecentLinks() {
  const links = useSyncExternalStore(subscribeLinks, getLinksSnapshot, getServerLinks);
  const [qrLink, setQrLink] = useState<KozaLink | null>(null);

  /* Keyed by slug list so click-count updates do NOT re-trigger the fetch in a loop */
  const slugsKey = links.map((l) => l.slug).join(",");

  useEffect(() => {
    if (!slugsKey) return;
    let alive = true;
    fetch("/api/v1/links", { signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { links?: { slug: string; clicks: number }[] } | null) => {
        if (!alive || !d?.links?.length) return;
        const remote = new Map(d.links.map((l) => [l.slug, l.clicks] as const));
        const current = getLinksSnapshot();
        for (const l of current) {
          const c = remote.get(l.slug);
          if (typeof c === "number" && c !== l.clicks) {
            syncClicks(l.id, c);
          }
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
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
    <section aria-label="Your links, local to this browser">
      <div className="kz-edge kz-scroll max-h-36 overflow-y-auto sm:max-h-48">
        <ul className="divide-y divide-[var(--kz-hairline)]" aria-label="Saved short links">
          {links.map((link) => (
            <li
              key={link.id}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
            >
              <FaviconAvatar url={link.url} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">
                    koza.click/<span className="text-[var(--kz-ash)]">{link.slug}</span>
                  </p>
                  {link.locked && (
                    <Lock className="h-3 w-3 shrink-0 text-[var(--kz-coral)]" />
                  )}
                </div>
                <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-smoke)]">
                  {hostOf(link.url)} · {timeAgo(link.createdAt)} · {link.clicks} clicks
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover:opacity-100">
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
                      description: "the short link itself stays live on koza.click",
                    });
                  }}
                  danger
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* QR modal */}
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
                koza.click/<span className="text-[var(--kz-coral)]">{qrLink.slug}</span>
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
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
