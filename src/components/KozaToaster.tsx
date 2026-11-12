// SPDX-License-Identifier: MPL-2.0
"use client";

import { Toaster } from "sonner";

/* one toaster style for every page */
export function KozaToaster() {
  return (
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
  );
}
