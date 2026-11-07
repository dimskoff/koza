"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRouter, usePathname } from "next/navigation";
import { BoxMark, CubeMark, LinkMark } from "./marks";

/* Ask the shared veil to carry us to another koza site.
   The veil covers the screen, the route swaps underneath,
   then the veil lifts — one continuous beat, no white flash. */
export function wipeTo(path: string) {
  window.dispatchEvent(new CustomEvent("kz:wipe", { detail: path }));
}

/* Where are we going? Pick the mark + the address to announce.
   Literal colors only — the veil renders outside `.kz-root`. */
function veilMeta(path: string): { mark: React.ReactNode; label: string } {
  if (path.startsWith("/box")) {
    return { mark: <BoxMark size={30} />, label: "box.koza.click" };
  }
  if (path.startsWith("/r/")) {
    return { mark: <BoxMark size={30} />, label: `box.koza.click${path.toLowerCase()}` };
  }
  if (path.startsWith("/docs")) {
    return { mark: <CubeMark size={26} />, label: "koza.click · api docs" };
  }
  if (path === "/") {
    return { mark: <LinkMark size={28} />, label: "koza.click" };
  }
  return { mark: <LinkMark size={28} />, label: `koza.click${path.toLowerCase()}` };
}

const COVER_MS = 230; // fade to black
const LIFT_DELAY = 140; // let the new page paint while still covered
const FAILSAFE_MS = 1100; // never stay stuck under the veil

const ASH = "#9c9c9d";
const SMOKE = "#6a6b6c";
const CORAL = "#FF6363";

export function WipeLayer() {
  const router = useRouter();
  const pathname = usePathname();
  const [veiled, setVeiled] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  const lift = useCallback(() => {
    setTarget(null);
    setVeiled(false);
  }, []);

  useEffect(() => {
    const onWipe = (e: Event) => {
      const to = (e as CustomEvent<string>).detail;
      if (!to || target) return;
      if (to === pathname) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      setTarget(to);
      setVeiled(true);
    };
    window.addEventListener("kz:wipe", onWipe);
    return () => window.removeEventListener("kz:wipe", onWipe);
  }, [pathname, target]);

  /* covered → swap the route underneath */
  useEffect(() => {
    if (!veiled || !target) return;
    const t = window.setTimeout(() => router.push(target), COVER_MS - 40);
    const failsafe = window.setTimeout(lift, FAILSAFE_MS);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(failsafe);
    };
  }, [veiled, target, router, lift]);

  /* arrived → lift the veil */
  useEffect(() => {
    if (veiled && target && pathname === target) {
      const t = window.setTimeout(lift, LIFT_DELAY);
      return () => window.clearTimeout(t);
    }
  }, [pathname, veiled, target, lift]);

  const meta = veilMeta(target ?? pathname);

  return (
    <AnimatePresence>
      {veiled && target && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.23, ease: [0.3, 0.6, 0.3, 1] }}
          className="fixed inset-0 z-[120] flex items-center justify-center bg-[#050506]"
          aria-hidden="true"
        >
          <div className="flex flex-col items-center gap-5">
            <motion.div
              initial={{ scale: 0.78, opacity: 0, y: 8 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 1.05, opacity: 0, y: -6 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {meta.mark}
            </motion.div>

            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.07, duration: 0.26, ease: "easeOut" }}
              className="kz-mono text-[13px] tracking-tight"
              style={{ color: ASH }}
            >
              <span style={{ color: SMOKE }}>opening </span>
              <span style={{ color: "#e6e6e6" }}>{meta.label}</span>
            </motion.p>

            <div className="relative h-[2px] w-40 overflow-hidden rounded-full bg-white/[0.08]">
              <span
                className="kz-veil-wire absolute inset-y-0 left-0 rounded-full"
                style={{ background: CORAL, boxShadow: `0 0 8px rgba(255,99,99,0.8)` }}
              />
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
