// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useSyncExternalStore, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Copy, ExternalLink, Lock, MousePointerClick, QrCode, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
      <div className="mb-2 flex items-center justify-between px-1">
        <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
          Recent links ({links.length})
        </span>
        <Badge variant="secondary">Saved locally</Badge>
      </div>
      <div className="kz-edge kz-scroll max-h-44 overflow-y-auto">
        <ul className="divide-y divide-[var(--kz-hairline)]" aria-label="Saved short links">
          {links.map((link) => (
            <li
              key={link.id}
              className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.025]"
            >
              <span
                className="kz-mono flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04] text-sm uppercase text-[var(--kz-coral)]"
                aria-hidden="true"
              >
                {hostOf(link.url).charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="kz-mono truncate text-[13px] text-[var(--kz-mist)]">
                    koza.click/<span className="text-[var(--kz-coral)]">{link.slug}</span>
                  </p>
                  {link.locked && (
                    <Badge variant="coral" className="px-1.5 py-0 text-[10px]">
                      <Lock className="h-2.5 w-2.5" /> locked
                    </Badge>
                  )}
                </div>
                <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-smoke)]">
                  {hostOf(link.url)} · {timeAgo(link.createdAt)}
                </p>
              </div>
              <Badge variant="secondary" className="hidden sm:inline-flex">
                <MousePointerClick className="h-3 w-3 text-[var(--kz-coral)]" />
                {link.clicks}
              </Badge>
              <div className="flex shrink-0 items-center gap-0.5 opacity-75 transition-opacity group-hover:opacity-100">
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
              <Badge variant="secondary">Scan to open</Badge>
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
