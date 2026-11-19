// SPDX-License-Identifier: MPL-2.0
"use client";

import type { ReactNode } from "react";
import { POLICY_MAIN_CLASS, PolicyContent } from "./koza/PolicyContent";
import { ApiDocsContent, DOCS_MAIN_CLASS } from "./koza/ApiDocs";
import { StatusDashboard } from "./koza/StatusDashboard";
import { Headline } from "./Headline";
import { ShortenerSkeleton, TransferSkeleton, useArrivalRelease } from "./skeletons";
import { STATUS_MAIN_CLASS, type PageTarget } from "@/lib/pages";
import { useProductTransition } from "./transition";

export { STATUS_MAIN_CLASS } from "@/lib/pages";

const HOME_MAIN_CLASS = "flex flex-1 flex-col items-center justify-center px-4 py-8";

/* The skeleton of a page is the page itself in "ghost" mode: the real layout
   with text turned into placeholder bars (see .kz-ghost in globals.css). Same
   markup → same size, so swapping skeleton ↔ page never moves anything. */
export function GhostMain({ page }: { page: PageTarget }) {
  switch (page) {
    case "url":
      return (
        <main className={HOME_MAIN_CLASS} aria-hidden="true">
          <Headline product="url" />
          <div className="mt-8 w-full max-w-xl">
            <ShortenerSkeleton />
          </div>
          <div className="kz-below-card w-full max-w-xl" />
        </main>
      );
    case "box":
      return (
        <main className={HOME_MAIN_CLASS} aria-hidden="true">
          <Headline product="box" />
          <div className="mt-8 w-full max-w-xl">
            <TransferSkeleton />
          </div>
        </main>
      );
    case "status":
      return (
        <main className={`${STATUS_MAIN_CLASS} kz-ghost`} aria-hidden="true" inert>
          <StatusDashboard ghost />
        </main>
      );
    case "docs":
      return (
        <main className={`${DOCS_MAIN_CLASS} kz-ghost`} aria-hidden="true" inert>
          <ApiDocsContent />
        </main>
      );
    case "policy":
      return (
        <main className={`${POLICY_MAIN_CLASS} kz-ghost`} aria-hidden="true" inert>
          <PolicyContent />
        </main>
      );
  }
}

/* Wraps a page's <main>. On arrival via a page transition it starts covered
   by its own ghost and crossfades into the real content. The wrapper keeps the
   flex-column layout of the page root, so <main className="flex-1 …"> behaves
   exactly as if it were a direct child. */
export function PageArrival({ page, children }: { page: PageTarget; children: ReactNode }) {
  useArrivalRelease();
  const leavingTo = useProductTransition();
  /* leaving: become the destination's skeleton until the browser navigates */
  if (leavingTo && leavingTo !== page) return <GhostMain page={leavingTo} />;
  return (
    <div className="relative flex flex-1 flex-col">
      <div className="kz-veil-content flex flex-1 flex-col">{children}</div>
      <div className="kz-veil kz-veil-page pointer-events-none absolute inset-0 flex flex-col">
        <GhostMain page={page} />
      </div>
    </div>
  );
}
