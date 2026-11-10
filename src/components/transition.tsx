// SPDX-License-Identifier: MPL-2.0
"use client";

import { useSyncExternalStore } from "react";

export type ProductMode = "url" | "box";

interface TransitionStore {
  isSwitchingTo: ProductMode | null;
}

let storeState: TransitionStore = {
  isSwitchingTo: null,
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function isProductionDomain(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname.toLowerCase();
  return h === "koza.click" || h === "www.koza.click" || h === "box.koza.click";
}

export function getProductUrl(target: ProductMode): string {
  if (typeof window === "undefined") {
    return target === "box" ? "/box" : "/";
  }
  const host = window.location.hostname.toLowerCase();
  const isProd = host === "koza.click" || host === "www.koza.click" || host === "box.koza.click";

  if (isProd) {
    return target === "box" ? "https://box.koza.click" : "https://koza.click";
  }
  return target === "box" ? "/box" : "/";
}

export function prefetchProduct(target: ProductMode) {
  if (typeof document === "undefined") return;
  const destination = getProductUrl(target);
  const id = `prefetch-${target}`;
  if (document.getElementById(id)) return;
  try {
    const link = document.createElement("link");
    link.id = id;
    link.rel = "prefetch";
    link.href = destination;
    document.head.appendChild(link);
  } catch {}
}

export function navigateToProduct(target: ProductMode) {
  if (storeState.isSwitchingTo !== null) return;

  const destination = getProductUrl(target);
  const pathname = typeof window !== "undefined" ? window.location.pathname : "";
  const host = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";

  // Проверяем, находимся ли мы уже на целевом сервисе на главной
  const isAlreadyOnBoxHome =
    (host.startsWith("box.") || pathname === "/box") && pathname === (host.startsWith("box.") ? "/" : "/box");
  const isAlreadyOnUrlHome =
    !host.startsWith("box.") && pathname === "/";

  if ((target === "box" && isAlreadyOnBoxHome) || (target === "url" && isAlreadyOnUrlHome)) {
    return;
  }

  // Если пользователь находится на подстранице (/status, /docs, /policy и т.д.), сразу переходим
  const isSubpage = pathname !== "/" && pathname !== "/box";
  if (isSubpage) {
    window.location.href = destination;
    return;
  }

  prefetchProduct(target);

  // На главной включаем скелетон и сразу направляем браузер
  storeState = { isSwitchingTo: target };
  emitChange();

  window.setTimeout(() => {
    window.location.href = destination;
  }, 160);
}

export function switchTo(target: ProductMode) {
  navigateToProduct(target);
}

export function wipeTo(path: string) {
  if (path.includes("box") || path.startsWith("/r/")) {
    navigateToProduct("box");
  } else {
    navigateToProduct("url");
  }
}

export function useProductTransition(): ProductMode | null {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => storeState.isSwitchingTo,
    () => null,
  );
}

export function WipeLayer() {
  return null;
}
