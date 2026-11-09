// SPDX-License-Identifier: MPL-2.0
"use client";

import { useSyncExternalStore } from "react";

export type TargetProduct = "box" | "url" | null;

let currentTarget: TargetProduct = null;
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

export function switchTo(target: "box" | "url") {
  if (currentTarget) return;
  currentTarget = target;
  emitChange();

  const isBoxTarget = target === "box";
  let destination = isBoxTarget ? "/box" : "/";

  if (isProductionDomain()) {
    const host = window.location.hostname.toLowerCase();
    if (isBoxTarget && !host.startsWith("box.")) {
      destination = "https://box.koza.click";
    } else if (!isBoxTarget && host.startsWith("box.")) {
      destination = "https://koza.click";
    }
  }

  // Плавная задержка 320мс для проигрывания анимации скелетона и навбара
  window.setTimeout(() => {
    window.location.href = destination;
  }, 320);
}

export function wipeTo(path: string) {
  if (path.includes("box") || path.startsWith("/r/")) {
    switchTo("box");
  } else {
    switchTo("url");
  }
}

export function useSiteTransition(): TargetProduct {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => currentTarget,
    () => null,
  );
}

// Заглушка для обратной совместимости, чтобы ничего не ломалось
export function WipeLayer() {
  return null;
}
