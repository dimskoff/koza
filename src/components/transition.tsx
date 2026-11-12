// SPDX-License-Identifier: MPL-2.0
"use client";

import { useSyncExternalStore } from "react";
import { ARRIVAL_HASH } from "@/lib/arrival";
import { getSite } from "@/lib/site";

export type ProductMode = "url" | "box";

let switchingTo: ProductMode | null = null;
const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) listener();
}

export function getProductUrl(target: ProductMode): string {
  const { baseUrl, boxUrl } = getSite();
  return target === "box" ? boxUrl : baseUrl;
}

export function prefetchProduct(target: ProductMode) {
  if (typeof document === "undefined") return;
  const id = `prefetch-${target}`;
  if (document.getElementById(id)) return;
  try {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "prefetch";
    link.href = getProductUrl(target);
    document.head.appendChild(link);
  } catch {
    /* prefetch is best-effort */
  }
}

function currentProduct(): ProductMode {
  const { boxHost } = getSite();
  return window.location.host.toLowerCase() === boxHost ? "box" : "url";
}

export function switchTo(target: ProductMode) {
  if (switchingTo !== null || typeof window === "undefined") return;

  const destination = getProductUrl(target);
  const onHome = window.location.pathname === "/";

  if (currentProduct() === target && onHome) return;

  /* sub-pages (/status, /docs, /policy…) have no card to morph — just go */
  if (!onHome) {
    window.location.href = destination;
    return;
  }

  prefetchProduct(target);
  switchingTo = target;
  emitChange();

  /* the arriving page picks the hash up in <head> and crossfades from the
     same skeleton (see ArrivalVeil) */
  window.setTimeout(() => {
    window.location.href = `${destination}/#${ARRIVAL_HASH}`;
  }, 160);
}

export function useProductTransition(): ProductMode | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => switchingTo,
    () => null,
  );
}
