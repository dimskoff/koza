"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";

export const KOZA_REPO = "https://github.com/dimskoff/koza";

/* github mark, current-path style so it sits quietly in mono ui */
export function GithubMark({ className = "h-3.5 w-3.5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

/* the footer/nav github link with a live star count (best effort) */
export function GithubLink({ label = "github" }: { label?: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cached: number | null = null;
    try {
      const raw = sessionStorage.getItem("koza_gh_stars");
      cached = raw ? Number(raw) : null;
    } catch {
      /* private mode */
    }
    const t = window.setTimeout(() => {
      if (cached !== null && Number.isFinite(cached)) {
        setStars(cached);
        return;
      }
      fetch("https://api.github.com/repos/dimskoff/koza", {
        signal: AbortSignal.timeout(4000),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { stargazers_count?: number } | null) => {
          if (typeof d?.stargazers_count === "number") {
            setStars(d.stargazers_count);
            try {
              sessionStorage.setItem("koza_gh_stars", String(d.stargazers_count));
            } catch {
              /* whatever */
            }
          }
        })
        .catch(() => {});
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <a
      href={KOZA_REPO}
      target="_blank"
      rel="noreferrer"
      className="kz-ghost-btn flex items-center gap-1 rounded-md px-1.5 py-1"
    >
      <GithubMark className="h-3 w-3" />
      {label}
      {stars !== null && (
        <span className="kz-mono rounded-full bg-white/[0.07] px-1.5 text-[10px] leading-4 text-[var(--kz-ash)]">
          ★ {stars}
        </span>
      )}
      <ArrowUpRight className="h-3 w-3" />
    </a>
  );
}
