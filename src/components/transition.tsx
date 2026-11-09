// SPDX-License-Identifier: MPL-2.0
"use client";

import { useSyncExternalStore } from "react";

export type ProductMode = "url" | "box";

interface TransitionStore {
  mode: ProductMode;
  isSwitchingTo: ProductMode | null;
}

let storeState: TransitionStore = {
  mode: "url",
  isSwitchingTo: null,
};

const listeners = new Set<() => void>();

function emitChange() {
  for (const listener of listeners) {
    listener();
  }
}

export function initProductMode(initial: ProductMode) {
  if (storeState.mode !== initial && storeState.isSwitchingTo === null) {
    storeState = { ...storeState, mode: initial };
    emitChange();
  }
}

export function switchTo(target: ProductMode) {
  if (storeState.mode === target || storeState.isSwitchingTo !== null) return;

  // 1. Включаем анимацию перехода и скелетон
  storeState = { ...storeState, isSwitchingTo: target };
  emitChange();

  // 2. Через 260 мс мягко переключаем активный режим без единой перезагрузки страницы
  window.setTimeout(() => {
    storeState = { mode: target, isSwitchingTo: null };
    emitChange();

    try {
      const newPath = target === "box" ? "/box" : "/";
      if (window.location.pathname !== newPath) {
        window.history.pushState(null, "", newPath);
      }
    } catch {
      // игнорируем ошибку history если в sandbox
    }
  }, 260);
}

export function wipeTo(path: string) {
  if (path.includes("box") || path.startsWith("/r/")) {
    switchTo("box");
  } else {
    switchTo("url");
  }
}

export function useProductState(): TransitionStore {
  return useSyncExternalStore(
    (onStoreChange) => {
      listeners.add(onStoreChange);
      return () => listeners.delete(onStoreChange);
    },
    () => storeState,
    () => storeState,
  );
}

export function useSiteTransition(): ProductMode | null {
  const st = useProductState();
  return st.isSwitchingTo;
}

export function WipeLayer() {
  return null;
}
