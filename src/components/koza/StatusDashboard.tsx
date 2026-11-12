// SPDX-License-Identifier: MPL-2.0
"use client";

import { getSite } from "@/lib/site";
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { BoxMark, CubeMark, LinkMark } from "../marks";

interface ServiceHealth {
  ok: boolean;
  label: string;
}

interface StatsData {
  status?: string;
  uptime_seconds?: number;
  links_count?: number;
  redirects?: number;
  total_clicks?: number;
  rooms_count?: number;
  rooms?: number;
  services?: {
    http_api?: ServiceHealth | string;
    ws_signaling?: ServiceHealth | string;
    storage?: ServiceHealth | string;
  };
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  return `${h}h ${m}m`;
}

export function StatusDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);

  const fetchStats = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    const t0 = performance.now();
    try {
      const r = await fetch("/api/v1/stats", { cache: "no-store" });
      const rtt = Math.max(1, Math.round(performance.now() - t0));
      if (r.ok) {
        const data: StatsData = await r.json();
        setStats(data);
        setOnline(true);
        setPingMs(rtt);
      } else {
        setOnline(false);
      }
    } catch {
      setOnline(false);
    } finally {
      setLoading(false);
      if (manual) setTimeout(() => setRefreshing(false), 260);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    const id = setInterval(() => fetchStats(false), 5000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const isServiceOk = (v: ServiceHealth | string | undefined) =>
    online === true &&
    (v === undefined ? true : typeof v === "string" ? v !== "down" : Boolean(v.ok));

  const services = [
    {
      id: "koza",
      name: getSite().host,
      desc: "Short links & redirects",
      ok: isServiceOk(stats?.services?.http_api),
      mark: <LinkMark size={16} />,
    },
    {
      id: "box",
      name: getSite().boxHost,
      desc: "Direct peer-to-peer file rooms",
      ok: isServiceOk(stats?.services?.ws_signaling),
      mark: <BoxMark size={16} />,
    },
    {
      id: "signal",
      name: "API & Signaling",
      desc: "REST API & link storage",
      ok: isServiceOk(stats?.services?.http_api) && isServiceOk(stats?.services?.storage),
      mark: <CubeMark size={15} />,
    },
  ];

  const linksCount = Number(stats?.links_count ?? stats?.redirects ?? 0);
  const clicksCount = Number(stats?.total_clicks ?? 0);
  const roomsCount = Number(
    stats?.rooms_count ?? (typeof stats?.rooms === "number" ? stats.rooms : 0),
  );

  return (
    <div className="w-full max-w-xl">
      <h1 className="text-balance text-center text-3xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-4xl">
        {online === false || stats?.status === "degraded" ? (
          <>
            {online === false ? "Service" : "Partial"}{" "}
            <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
              {online === false ? "unreachable" : "outage"}
            </span>
            .
          </>
        ) : (
          <>
            All systems{" "}
            <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
              operational
            </span>
            .
          </>
        )}
      </h1>

      <div className="kz-edge mt-7 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] px-5 py-3">
          <span className="kz-mono flex items-center gap-2 text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
            <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
              {online && (
                <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              )}
              <span
                className={`h-2 w-2 rounded-full ${
                  online === null
                    ? "bg-amber-400"
                    : online
                      ? "bg-emerald-400"
                      : "bg-red-500"
                }`}
              />
            </span>
            {online === null ? "checking…" : online ? "live status" : "offline"}
          </span>

          <div className="flex items-center gap-3">
            {pingMs !== null && (
              <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                {pingMs} ms
                {stats?.uptime_seconds
                  ? ` · up ${fmtUptime(stats.uptime_seconds)}`
                  : ""}
              </span>
            )}
            <button
              type="button"
              onClick={() => fetchStats(true)}
              className="kz-ghost-btn cursor-pointer rounded-md p-1 text-[var(--kz-smoke)] hover:text-[var(--kz-mist)]"
              aria-label="Refresh status"
              title="Refresh"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--kz-coral)]" : ""}`}
              />
            </button>
          </div>
        </div>

        {/* Service list */}
        <div className="p-5">
          {loading && !stats ? (
            <div className="kz-inset divide-y divide-[var(--kz-hairline)]">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3.5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-8 w-8 rounded-lg bg-white/[0.05]" />
                    <div className="space-y-1.5">
                      <Skeleton className="h-3.5 w-24 rounded-md bg-white/[0.06]" />
                      <Skeleton className="h-2.5 w-36 rounded-md bg-white/[0.04]" />
                    </div>
                  </div>
                  <Skeleton className="h-3.5 w-16 rounded-md bg-white/[0.05]" />
                </div>
              ))}
            </div>
          ) : (
            <ul className="kz-inset divide-y divide-[var(--kz-hairline)]">
              {services.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 px-4 py-3.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
                      {s.mark}
                    </span>
                    <div className="min-w-0">
                      <p className="kz-mono truncate text-[13px] font-medium text-[var(--kz-mist)]">
                        {s.name}
                      </p>
                      <p className="kz-mono truncate text-[11px] text-[var(--kz-smoke)]">
                        {s.desc}
                      </p>
                    </div>
                  </div>

                  <span className="kz-mono flex shrink-0 items-center gap-1.5 text-[11.5px] text-[var(--kz-ash)]">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        s.ok ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    {s.ok ? "Operational" : "Down"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Bottom strip */}
        <div className="flex items-center justify-between border-t border-[var(--kz-hairline)] px-5 py-3">
          <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
            {linksCount.toLocaleString()} links · {clicksCount.toLocaleString()} clicks
          </span>
          <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
            {roomsCount} active room{roomsCount === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>
  );
}
