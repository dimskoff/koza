// SPDX-License-Identifier: MPL-2.0
"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Zap } from "lucide-react";
import { Toaster } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { initProductMode, useProductState } from "../transition";
import { Shortener } from "./Shortener";
import { RecentLinks } from "./RecentLinks";
import { TransferCard } from "../box/TransferCard";
import { KozaFooter, KozaNav } from "./Sections";

function BoxTransitionSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="kz-edge mx-auto w-full max-w-xl overflow-hidden p-5 sm:p-6"
    >
      <div className="mb-4 flex items-center justify-between border-b border-[var(--kz-hairline)] pb-3">
        <Skeleton className="h-3 w-24 bg-white/[0.08]" />
        <Skeleton className="h-3 w-16 bg-white/[0.05]" />
      </div>

      <div className="kz-inset flex flex-col items-center justify-center border border-dashed border-[var(--kz-hairline-strong)] bg-white/[0.02] px-6 py-9 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04]">
          <Zap className="h-5 w-5 animate-pulse text-[var(--kz-coral)]" />
        </div>
        <Skeleton className="mb-2 h-5 w-36 bg-white/[0.08]" />
        <Skeleton className="h-3.5 w-64 max-w-full bg-white/[0.05]" />
      </div>

      <div className="mt-4 flex items-center justify-center gap-2">
        <span className="kz-mono text-[11.5px] text-[var(--kz-smoke)]">
          opening box.koza.click…
        </span>
      </div>
    </motion.div>
  );
}

function ShortenerTransitionSkeleton() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.18 }}
      className="kz-edge relative mx-auto w-full max-w-2xl overflow-hidden pb-2.5"
    >
      <div className="relative flex min-h-[56px] items-center gap-2 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4">
        <Skeleton className="h-5 w-3/5 bg-white/[0.08]" />
        <div className="ml-auto">
          <Skeleton className="h-10 w-28 rounded-[9px] bg-white/[0.1]" />
        </div>
      </div>
      <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
        <Skeleton className="h-3 w-28 bg-white/[0.05]" />
        <span className="kz-mono text-[11.5px] text-[var(--kz-smoke)]">
          opening koza.click…
        </span>
      </div>
    </motion.div>
  );
}

export function KozaSite({ defaultMode = "url" }: { defaultMode?: "url" | "box" }) {
  const { mode, isSwitchingTo } = useProductState();

  useEffect(() => {
    initProductMode(defaultMode);
  }, [defaultMode]);

  const targetMode = isSwitchingTo ?? mode;
  const isBox = targetMode === "box";

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{
          style: {
            background: "rgba(17,18,20,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e6e6e6",
            borderRadius: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          },
        }}
      />
      <KozaNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait">
          {isBox ? (
            <motion.h1
              key="box-title"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl"
            >
              Files that travel{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                straight
              </span>
              .
            </motion.h1>
          ) : (
            <motion.h1
              key="koza-title"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.18 }}
              className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl"
            >
              Short links,{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                zero strings
              </span>
              .
            </motion.h1>
          )}
        </AnimatePresence>

        <div className="mt-8 w-full max-w-2xl">
          <AnimatePresence mode="wait">
            {isSwitchingTo === "box" ? (
              <BoxTransitionSkeleton key="box-skeleton" />
            ) : isSwitchingTo === "url" ? (
              <ShortenerTransitionSkeleton key="url-skeleton" />
            ) : isBox ? (
              <motion.div
                key="transfer-block"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                className="mx-auto max-w-xl"
              >
                <TransferCard />
              </motion.div>
            ) : (
              <motion.div
                key="shortener-block"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.18 }}
              >
                <Shortener />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {!isBox && isSwitchingTo === null && (
          <div className="mt-5 w-full max-w-2xl">
            <RecentLinks />
          </div>
        )}
      </main>
      <KozaFooter />
    </div>
  );
}
