"use client";

import { useEffect, useRef, useState } from "react";

interface KozaQrProps {
  value: string;
  size?: number;
}

/* Styled QR — coral corner eyes, rounded dots, transparent background */
export function KozaQr({ value, size = 176 }: KozaQrProps) {
  const holder = useRef<HTMLDivElement>(null);
  /* which value/size has finished rendering — "ready" is derived from it, so
   * no synchronous setState is needed when the value changes */
  const renderKey = `${size}:${value}`;
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const ready = readyKey === renderKey;

  useEffect(() => {
    let cancelled = false;
    import("qr-code-styling").then((mod) => {
      if (cancelled || !holder.current) return;
      holder.current.innerHTML = "";
      const qr = new mod.default({
        width: size,
        height: size,
        type: "svg",
        data: value,
        margin: 0,
        dotsOptions: { color: "#d9d9d9", type: "rounded" },
        cornersSquareOptions: { color: "#ff6363", type: "extra-rounded" },
        cornersDotOptions: { color: "#ff6363" },
        backgroundOptions: { color: "transparent" },
      });
      qr.append(holder.current);
      setReadyKey(`${size}:${value}`);
    }).catch(() => {
      /* chunk failed to load (offline / deploy in progress) — keep it hidden */
    });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  return (
    <div
      ref={holder}
      role="img"
      aria-label={`QR code for ${value}`}
      className={`transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
    />
  );
}
