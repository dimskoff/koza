// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Download, Play, X } from "lucide-react";
import { prettySize } from "./lib";
import { VideoPlayer } from "./VideoPlayer";

/* Image formats every modern browser can render. HEIC/RAW are left out on
   purpose: they'd show a broken tile, so they're saved like any other file. */
const PREVIEW_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "avif", "bmp", "svg", "ico"]);

export function isPreviewableImage(name: string, type = ""): boolean {
  if (/^image\/(heic|heif)/i.test(type)) return false;
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return PREVIEW_EXT.has(ext) || /^image\/(png|jpe?g|gif|webp|avif|bmp|svg\+xml)$/i.test(type);
}

/* Containers browsers play natively. Codec support still varies (e.g. HEVC
   in .mov) — the player falls back to "download to watch" if it can't. */
const VIDEO_EXT = new Set(["mp4", "m4v", "webm", "mov", "ogv"]);

export function isPreviewableVideo(name: string, type = ""): boolean {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VIDEO_EXT.has(ext) || /^video\/(mp4|webm|ogg|quicktime)$/i.test(type);
}

/** shown in the page (photo or video) instead of dropped into Downloads */
export const isPreviewable = (name: string, type = "") =>
  isPreviewableImage(name, type) || isPreviewableVideo(name, type);

export interface GalleryItem {
  index: number;
  name: string;
  size: number;
  blob: Blob;
}

/* Photos and videos open as a preview instead of being dropped into Downloads; every
   tile and the full-screen viewer have their own download button. */
export function PhotoGallery({
  items,
  onDownload,
}: {
  items: GalleryItem[];
  onDownload: (item: GalleryItem) => void;
}) {
  /* object URLs for the blobs — created once per blob, revoked on change/unmount */
  const urls = useMemo(() => items.map((it) => URL.createObjectURL(it.blob)), [items]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);

  const [open, setOpen] = useState<number | null>(null);
  const current = open !== null ? items[open] : null;

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? i : (i + 1) % items.length));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? i : (i - 1 + items.length) % items.length));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items.length]);

  if (items.length === 0) return null;
  const single = items.length === 1;

  return (
    <>
      <div className={`grid gap-2 ${single ? "grid-cols-1" : "grid-cols-2 sm:grid-cols-3"}`}>
        <AnimatePresence initial={true}>
          {items.map((it, i) => (
            <motion.div
              key={`${it.index}-${it.name}`}
              initial={{ opacity: 0, filter: "blur(6px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className={`group relative overflow-hidden rounded-xl border border-[var(--kz-hairline)] bg-black/40 ${
                single ? "max-h-[420px]" : "aspect-square"
              }`}
            >
              <button
                type="button"
                onClick={() => setOpen(i)}
                className="block h-full w-full cursor-zoom-in"
                aria-label={`Open ${it.name}`}
              >
                {isPreviewableVideo(it.name, it.blob.type) ? (
                  <>
                    {/* first frame as the thumbnail */}
                    <video
                      src={`${urls[i]}#t=0.1`}
                      muted
                      playsInline
                      preload="metadata"
                      className={`h-full w-full ${single ? "max-h-[420px] object-contain" : "object-cover"}`}
                    />
                    <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur transition-transform duration-200 group-hover:scale-110">
                      <Play className="ml-0.5 h-5 w-5" fill="currentColor" />
                    </span>
                  </>
                ) : (
                  <img
                    src={urls[i]}
                    alt={it.name}
                    className={`h-full w-full ${single ? "max-h-[420px] object-contain" : "object-cover"} transition-transform duration-300 group-hover:scale-[1.03]`}
                    draggable={false}
                  />
                )}
              </button>
              <button
                type="button"
                onClick={() => onDownload(it)}
                className="absolute bottom-2 right-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg bg-black/60 text-white/90 opacity-90 backdrop-blur transition hover:bg-black/80 sm:opacity-0 sm:group-hover:opacity-100"
                aria-label={`Download ${it.name}`}
                title="Download"
              >
                <Download className="h-4 w-4" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {typeof document !== "undefined" &&
        createPortal(
      <AnimatePresence>
        {current && open !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-50 flex flex-col bg-black/90 backdrop-blur-sm"
            onClick={() => setOpen(null)}
            role="dialog"
            aria-modal="true"
            aria-label={current.name}
          >
            <div
              className="flex items-center justify-between gap-3 px-4 py-3"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="min-w-0">
                <p className="kz-mono truncate text-[13px] text-white/90">{current.name}</p>
                <p className="kz-mono text-[11px] text-white/50">
                  {prettySize(current.size)}
                  {items.length > 1 && ` · ${open + 1} / ${items.length}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => onDownload(current)}
                  className="kz-cta flex h-9 cursor-pointer items-center gap-1.5 rounded-[9px] px-3.5 text-[12.5px]"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-white/80 hover:bg-white/10"
                  aria-label="Close preview"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6">
              <AnimatePresence mode="wait" initial={false}>
                {isPreviewableVideo(current.name, current.blob.type) ? (
                  <motion.div
                    key={open}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex max-h-full max-w-full items-center justify-center"
                  >
                    <VideoPlayer src={urls[open]} autoPlay />
                  </motion.div>
                ) : (
                  <motion.img
                    key={open}
                    src={urls[open]}
                    alt={current.name}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.18 }}
                    className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                    draggable={false}
                  />
                )}
              </AnimatePresence>

              {items.length > 1 && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen((open - 1 + items.length) % items.length);
                    }}
                    className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Previous"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpen((open + 1) % items.length);
                    }}
                    className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
                    aria-label="Next"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
