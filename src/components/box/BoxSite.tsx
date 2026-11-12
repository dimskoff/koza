// SPDX-License-Identifier: MPL-2.0
"use client";

import { Headline } from "../Headline";
import { KozaToaster } from "../KozaToaster";
import { ArrivalVeil, ShortenerSkeleton, TransferSkeleton } from "../skeletons";
import { useProductTransition } from "../transition";
import { TransferCard } from "./TransferCard";
import { BoxFooter, BoxNav } from "./Sections";

export function BoxSite() {
  const leavingForUrl = useProductTransition() === "url";

  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaToaster />
      <BoxNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <Headline product={leavingForUrl ? "url" : "box"} />

        <div className="mt-8 w-full max-w-xl">
          {leavingForUrl ? (
            <ShortenerSkeleton />
          ) : (
            <ArrivalVeil skeleton={<TransferSkeleton />}>
              <TransferCard />
            </ArrivalVeil>
          )}
        </div>
      </main>
      <BoxFooter />
    </div>
  );
}
