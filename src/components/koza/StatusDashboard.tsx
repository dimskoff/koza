// SPDX-License-Identifier: MPL-2.0
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  Cpu,
  Database,
  ExternalLink,
  HardDrive,
  MousePointerClick,
  Network,
  Radio,
  RefreshCw,
  Server,
  ShieldCheck,
  Wifi,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

interface ServiceHealth {
  ok: boolean;
  label: string;
}

interface StatsData {
  status?: string;
  version?: string;
  server_time?: string;
  uptime_seconds?: number;
  redirects?: number;
  links_count?: number;
  total_clicks?: number;
  rooms?: number;
  rooms_count?: number;
  active_lines?: number;
  ws_clients?: number;
  node_version?: string;
  platform?: string;
  cpu_cores?: number;
  load_avg?: number[];
  memory?: {
    rss_mb: number;
    heap_used_mb: number;
    heap_total_mb: number;
    external_mb?: number;
  };
  memory_mb?: number;
  transfer_stats?: {
    total_rooms_created: number;
    total_bytes_relayed: number;
    total_files_relayed?: number;
    total_frames_relayed?: number;
    active_relay_streams?: number;
    active_streams?: number;
  };
  services?: {
    http_api?: ServiceHealth | string;
    ws_signaling?: ServiceHealth | string;
    ws_signal?: ServiceHealth | string;
    turbo_relay?: ServiceHealth | string;
    turn_ice?: ServiceHealth | string;
    storage?: ServiceHealth | string;
  };
}

function fmtUptime(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${h}h ${m}m`;
}

function fmtSize(b: number): string {
  if (!b || b <= 0) return "0 B";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function StatusDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingHistory, setPingHistory] = useState<number[]>([]);

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
        setPingHistory((prev) => [...prev.slice(-23), rtt]);
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
    const id = setInterval(() => fetchStats(false), 4000);
    return () => clearInterval(id);
  }, [fetchStats]);

  const avgPing = useMemo(() => {
    if (pingHistory.length === 0) return pingMs ?? 0;
    return Math.round(pingHistory.reduce((a, b) => a + b, 0) / pingHistory.length);
  }, [pingHistory, pingMs]);

  const serviceRows = useMemo(() => {
    const s = stats?.services;
    const isOk = (v: ServiceHealth | string | undefined) =>
      v === undefined ? true : typeof v === "string" ? v !== "down" : Boolean(v.ok);
    const labelOf = (v: ServiceHealth | string | undefined, fallback: string) =>
      typeof v === "object" && v?.label ? v.label : fallback;

    return [
      {
        id: "http",
        name: "Shortener & REST API",
        detail: labelOf(s?.http_api, "Edge redirect & room registry"),
        ok: online === true && isOk(s?.http_api),
        icon: Server,
      },
      {
        id: "ws",
        name: "WSS Signaling Line",
        detail: labelOf(s?.ws_signaling ?? s?.ws_signal, "Real-time WebRTC SDP & ICE broker"),
        ok: online === true && isOk(s?.ws_signaling ?? s?.ws_signal),
        icon: Radio,
      },
      {
        id: "turbo",
        name: "Parallel Binary Stream (6x Lanes)",
        detail: labelOf(s?.turbo_relay, "Zero-copy TLS :443 multi-lane binary relay"),
        ok: online === true && isOk(s?.turbo_relay),
        icon: Zap,
      },
      {
        id: "turn",
        name: "STUN / TURN ICE Relay",
        detail: labelOf(s?.turn_ice, "NAT traversal & UDP punch-through"),
        ok: online === true && isOk(s?.turn_ice),
        icon: Network,
      },
      {
        id: "storage",
        name: "Persistence Engine",
        detail: labelOf(s?.storage, "Atomic link store · zero-disk file policy"),
        ok: online === true && isOk(s?.storage),
        icon: Database,
      },
    ];
  }, [stats, online]);

  const rssMb = stats?.memory?.rss_mb ?? stats?.memory_mb ?? 0;
  const heapUsedMb = stats?.memory?.heap_used_mb ?? 0;
  const heapTotalMb = stats?.memory?.heap_total_mb ?? 0;
  const heapPct = heapTotalMb > 0 ? Math.min(100, Math.round((heapUsedMb / heapTotalMb) * 100)) : 25;
  const activeLines = stats?.active_lines ?? 0;
  const relayedBytes = stats?.transfer_stats?.total_bytes_relayed ?? 0;
  const activeRoomsCount = stats?.rooms_count ?? (typeof stats?.rooms === "number" ? stats.rooms : 0);
  const totalRoomsCreated = stats?.transfer_stats?.total_rooms_created ?? activeRoomsCount;
  const redirectsCount = Number(stats?.links_count ?? stats?.redirects ?? 0);
  const clicksCount = Number(stats?.total_clicks ?? 0);
  const wsClientsCount = Number(stats?.ws_clients ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col py-4 sm:py-6">
      {/* ── HEADER ROW ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="coral">telemetry · live node</Badge>
            {stats?.version && <Badge variant="secondary">v{stats.version}</Badge>}
            <Badge variant="outline">MPL-2.0</Badge>
          </div>
          <h1 className="kz-display mt-2.5 text-[28px] sm:text-[34px]">
            System status
          </h1>
          <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
            real-time health, signaling pipelines, and zero-storage transfer metrics
          </p>
        </div>

        <button
          onClick={() => fetchStats(true)}
          className="kz-neutral-btn flex h-9 cursor-pointer items-center gap-1.5 rounded-lg px-3.5 text-[12px]"
          title="Refresh telemetry now"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-[var(--kz-ash)] ${refreshing ? "animate-spin text-[var(--kz-coral)]" : ""}`}
          />
          <span className="kz-mono">Refresh</span>
        </button>
      </div>

      {/* ── PRIMARY STATUS BANNER + LATENCY SPARKLINE ──────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="kz-edge mt-6 overflow-hidden"
      >
        <div className="flex flex-col justify-between gap-4 border-b border-[var(--kz-hairline)] px-5 py-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3.5">
            <span className="relative flex h-3.5 w-3.5 shrink-0">
              {online && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex h-3.5 w-3.5 rounded-full ${
                  online === null
                    ? "bg-amber-400"
                    : online
                      ? "bg-emerald-400"
                      : "bg-red-500"
                }`}
              />
            </span>
            <div>
              <div className="flex items-center gap-2.5">
                <p className="text-[15px] font-medium text-[var(--kz-mist)]">
                  {online === null
                    ? "Connecting to node…"
                    : online
                      ? "All systems operational"
                      : "API node unreachable"}
                </p>
                {online && pingMs !== null && (
                  <Badge variant="emerald">{pingMs} ms</Badge>
                )}
              </div>
              <p className="kz-mono mt-0.5 text-[11px] text-[var(--kz-smoke)]">
                {stats
                  ? `uptime ${fmtUptime(stats.uptime_seconds ?? 0)} · ${stats.node_version ?? "node"} (${stats.platform ?? "linux"}) · auto-sync 4s`
                  : "polling /api/v1/stats"}
              </p>
            </div>
          </div>

          {/* Live RTT sparkbars */}
          <div className="flex items-center gap-3 self-start sm:self-center">
            <div className="text-right">
              <p className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
                edge rtt
              </p>
              <p className="kz-mono text-[12px] text-[var(--kz-mist)]">
                {pingMs !== null ? `${pingMs}ms` : "—"}{" "}
                <span className="text-[10.5px] text-[var(--kz-smoke)]">
                  (avg {avgPing || "—"}ms)
                </span>
              </p>
            </div>
            <div
              className="kz-inset flex h-9 items-end gap-[3px] px-2.5 py-1.5"
              title="Live HTTP RTT latency history (last 24 samples)"
            >
              {Array.from({ length: 24 }).map((_, i) => {
                const sample = pingHistory[pingHistory.length - 24 + i];
                if (sample === undefined) {
                  return (
                    <span
                      key={i}
                      className="h-1.5 w-[3px] rounded-full bg-white/[0.08]"
                    />
                  );
                }
                const norm = Math.max(0.18, Math.min(1, sample / 220));
                const high = sample > 180;
                return (
                  <span
                    key={i}
                    style={{ height: `${Math.round(norm * 22)}px` }}
                    className={`w-[3px] rounded-full transition-all duration-200 ${
                      high ? "bg-[var(--kz-coral)]" : "bg-emerald-400/85"
                    }`}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* ── 6-CARD TELEMETRY METRICS GRID ──────────────────────── */}
        {!loading && stats && (
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--kz-hairline)] sm:grid-cols-3">
            {/* 1. Shortened links */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Active Links
                </span>
                <ExternalLink className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <p className="kz-mono mt-2 text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                {redirectsCount.toLocaleString()}
              </p>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                indexed redirects in store
              </p>
            </div>

            {/* 2. Total Clicks */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Total Clicks
                </span>
                <MousePointerClick className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <p className="kz-mono mt-2 text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                {clicksCount.toLocaleString()}
              </p>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                302 edge resolutions
              </p>
            </div>

            {/* 3. Box Rooms & Active Lines */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Box Rooms
                </span>
                <Zap className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="kz-mono text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                  {activeRoomsCount}
                </p>
                {activeLines > 0 && (
                  <Badge variant="emerald" className="text-[10px]">
                    {activeLines} paired
                  </Badge>
                )}
              </div>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                {totalRoomsCreated} created since boot
              </p>
            </div>

            {/* 4. Signaling Peers */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  WSS Peers
                </span>
                <Wifi className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <p className="kz-mono mt-2 text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                {wsClientsCount}
              </p>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                connected signaling sockets
              </p>
            </div>

            {/* 5. Stream Volume */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Streamed Volume
                </span>
                <Activity className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <p className="kz-mono mt-2 text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                {fmtSize(relayedBytes)}
              </p>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                zero-disk RAM cut-through
              </p>
            </div>

            {/* 6. Node Memory & CPU */}
            <div className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Node Memory
                </span>
                <Cpu className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <p className="kz-mono text-[24px] font-medium leading-none text-[var(--kz-mist)]">
                  {rssMb} <span className="text-[13px] text-[var(--kz-smoke)]">MB</span>
                </p>
              </div>
              <div className="mt-2">
                <Progress value={heapPct} className="h-1" />
              </div>
              <p className="kz-mono mt-1.5 text-[11px] text-[var(--kz-smoke)]">
                {heapUsedMb > 0
                  ? `heap ${heapUsedMb}/${heapTotalMb} MB · ${stats.cpu_cores ?? 1} vCPU`
                  : `rss footprint · ${stats.cpu_cores ?? 1} vCPU`}
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── SUBSYSTEM HEALTH MATRIX & TRANSPORT ARCHITECTURE ──── */}
      <div className="mt-4 grid gap-4 md:grid-cols-5">
        {/* Subsystem list (3 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.05 }}
          className="kz-edge p-5 md:col-span-3"
        >
          <div className="flex items-center justify-between">
            <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
              Subsystem Matrix
            </span>
            <Badge variant="emerald">
              {serviceRows.filter((r) => r.ok).length}/{serviceRows.length} online
            </Badge>
          </div>

          <ul className="kz-inset mt-3 divide-y divide-[var(--kz-hairline)]">
            {serviceRows.map((row) => {
              const Icon = row.icon;
              return (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
                      <Icon className="h-3.5 w-3.5 text-[var(--kz-ash)]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-[var(--kz-mist)]">
                        {row.name}
                      </p>
                      <p className="kz-mono truncate text-[11px] text-[var(--kz-smoke)]">
                        {row.detail}
                      </p>
                    </div>
                  </div>
                  <Badge variant={row.ok ? "emerald" : "destructive"}>
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        row.ok ? "bg-emerald-400" : "bg-red-400"
                      }`}
                    />
                    {row.ok ? "ready" : "down"}
                  </Badge>
                </li>
              );
            })}
          </ul>
        </motion.div>

        {/* Dual-Engine Architecture Spec (2 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.34, delay: 0.1 }}
          className="kz-edge flex flex-col justify-between p-5 md:col-span-2"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                Transport Engine
              </span>
              <ShieldCheck className="h-4 w-4 text-[var(--kz-coral)]" />
            </div>

            <div className="mt-3 space-y-2.5">
              <div className="kz-inset p-3">
                <div className="flex items-center justify-between">
                  <span className="kz-mono text-[11.5px] font-medium text-[var(--kz-mist)]">
                    01 · Direct P2P UDP
                  </span>
                  <Badge variant="emerald" className="text-[10px]">
                    LAN / STUN
                  </Badge>
                </div>
                <p className="kz-mono mt-1.5 text-[11px] leading-relaxed text-[var(--kz-smoke)]">
                  WebRTC DataChannel over direct UDP (`host` / `srflx`) when both peers share an open NAT path.
                </p>
              </div>

              <div className="kz-inset p-3">
                <div className="flex items-center justify-between">
                  <span className="kz-mono text-[11.5px] font-medium text-[var(--kz-mist)]">
                    02 · 6x Parallel Stream
                  </span>
                  <Badge variant="coral" className="text-[10px]">
                    VPN / CGNAT
                  </Badge>
                </div>
                <p className="kz-mono mt-1.5 text-[11px] leading-relaxed text-[var(--kz-smoke)]">
                  6 parallel TLS `:443` binary lanes with 12-byte self-describing headers and sliding-window backpressure.
                </p>
              </div>
            </div>
          </div>

          <Alert className="mt-3 py-2.5">
            <HardDrive className="h-4 w-4 text-emerald-400" />
            <AlertTitle className="text-xs">Zero-disk retention</AlertTitle>
            <AlertDescription className="kz-mono text-[11px]">
              Files stream strictly through volatile RAM buffers and never touch disk.
            </AlertDescription>
          </Alert>
        </motion.div>
      </div>
    </div>
  );
}
