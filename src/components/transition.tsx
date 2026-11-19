// SPDX-License-Identifier: MPL-2.0
"use client";

import { useSyncExternalStore } from "react";
import { ARRIVAL_HASH } from "@/lib/arrival";
import { isSubPage, SUBPAGE_PATH, type PageTarget, type ProductMode } from "@/lib/pages";
import { getSite } from "@/lib/site";

export type { PageTarget, ProductMode } from "@/lib/pages";

/* Page-to-page transitions: the leaving page swaps its content for the
   skeleton of the destination, navigates with #koza:switch-arrival, and the
   arriving page starts on that very same skeleton and crossfades into itself
   (see ArrivalVeil / PageArrival). */

let switchingTo: PageTarget | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function getProductUrl(target: ProductMode): string {
  const { baseUrl, boxUrl } = getSite();
  return target === "box" ? boxUrl : baseUrl;
}

function urlOf(target: PageTarget): string {
  if (isSubPage(target)) return `${window.location.origin}${SUBPAGE_PATH[target]}`;
  return `${getProductUrl(target)}/`;
}

/** which transition-aware page we're on (null = e.g. a receiver or link page) */
function currentPage(): PageTarget | null {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  for (const [page, p] of Object.entries(SUBPAGE_PATH)) {
    if (path === p) return page as PageTarget;
  }
  if (path !== "/") return null;
  return window.location.host.toLowerCase() === getSite().boxHost ? "box" : "url";
}

export function prefetchProduct(target: PageTarget) {
  if (typeof document === "undefined") return;
  const id = `prefetch-${target}`;
  if (document.getElementById(id)) return;
  try {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "prefetch";
    link.href = urlOf(target);
    document.head.appendChild(link);
  } catch {
    /* prefetch is best-effort */
  }
}

export function navigateTo(target: PageTarget) {
  if (switchingTo !== null || typeof window === "undefined") return;
  const here = currentPage();
  if (here === target) return;

  /* pages without a skeleton (receiver, link gate…) just go */
  if (here === null) {
    window.location.href = urlOf(target);
    return;
  }

  prefetchProduct(target);
  switchingTo = target;
  emitChange();
  window.setTimeout(() => {
    window.location.href = `${urlOf(target)}#${ARRIVAL_HASH}`;
  }, 160);
}

/** url ↔ box (kept as its own name — used by nav buttons and the receiver) */
export const switchTo = (target: ProductMode) => navigateTo(target);

/* Click handler for plain links: keeps cmd/ctrl/middle-click "open in new tab". */
export function onNavClick(target: PageTarget) {
  return (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    navigateTo(target);
  };
}

export function useProductTransition(): PageTarget | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => switchingTo,
    () => null,
  );
}
