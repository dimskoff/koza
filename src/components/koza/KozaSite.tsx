// SPDX-License-Identifier: MPL-2.0
"use client";

import { Headline } from "../Headline";
import { KozaToaster } from "../KozaToaster";
import { ArrivalVeil, ShortenerSkeleton, TransferSkeleton } from "../skeletons";
import { useProductTransition } from "../transition";
import { Shortener } from "./Shortener";
import { RecentLinks } from "./RecentLinks";
import { KozaFooter, KozaNav } from "./Sections";

export function KozaSite() {
  const leavingForBox = useProductTransition() === "box";

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaToaster />
      <KozaNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <Headline product={leavingForBox ? "box" : "url"} />

        <div className="mt-8 w-full max-w-xl">
          {leavingForBox ? (
            <TransferSkeleton />
          ) : (
            <ArrivalVeil skeleton={<ShortenerSkeleton />}>
              <Shortener />
            </ArrivalVeil>
          )}
        </div>

        {/* Zero-height slot: the list hangs below the centered card, so the card
            never moves when the local list hydrates or changes. */}
        <div className="kz-below-card mt-5 w-full max-w-xl">
          <div
            className={`transition-opacity duration-150 ${
              leavingForBox ? "pointer-events-none opacity-0" : "opacity-100"
            }`}
          >
            <RecentLinks />
          </div>
        </div>
      </main>
      <KozaFooter />
    </div>
  );
}
