// SPDX-License-Identifier: MPL-2.0
"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Toaster } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { useProductTransition } from "../transition";
import { TransferCard } from "./TransferCard";
import { BoxFooter, BoxNav } from "./Sections";

function ShortenerTransitionSkeleton() {
  return (
    <div className="kz-edge w-full overflow-hidden pb-2.5">
      <div className="flex min-h-[56px] items-center justify-between gap-2 border-b border-[var(--kz-hairline)] bg-white/[0.02] p-2 pl-4">
        <Skeleton className="h-5 w-44 bg-white/[0.08]" />
        <Skeleton className="h-10 w-28 rounded-[9px] bg-white/[0.1]" />
      </div>
      <div className="flex items-center justify-between px-4 pb-0.5 pt-2.5">
        <Skeleton className="h-3 w-28 bg-white/[0.05]" />
        <Skeleton className="h-3 w-20 bg-white/[0.04]" />
      </div>
    </div>
  );
}

export function BoxSite() {
  const transition = useProductTransition();
  const isSwitchingToUrl = transition === "url";

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
      <BoxNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <AnimatePresence mode="wait" initial={false}>
          {isSwitchingToUrl ? (
            <motion.h1
              key="url-title"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl"
            >
              Short links,{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                zero strings
              </span>
              .
            </motion.h1>
          ) : (
            <h1
              key="box-title"
              className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl"
            >
              Files that travel{" "}
              <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
                straight
              </span>
              .
            </h1>
          )}
        </AnimatePresence>

        <div className="mt-8 w-full max-w-xl">
          <AnimatePresence mode="wait" initial={false}>
            {isSwitchingToUrl ? (
              <motion.div
                key="url-skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15, ease: "easeInOut" }}
              >
                <ShortenerTransitionSkeleton />
              </motion.div>
            ) : (
              <div key="transfer-content" className="w-full">
                <TransferCard />
              </div>
            )}
          </AnimatePresence>
        </div>
      </main>
      <BoxFooter />
    </div>
  );
}
