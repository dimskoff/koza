"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowUpRight,
  Check,
  Clock,
  Copy,
  Cpu,
  Database,
  ExternalLink,
  HardDrive,
  Lock,
  MousePointerClick,
  Network,
  Radio,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Unlock,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { Toaster, toast } from "sonner";
import { KozaFooter, KozaNav } from "./Sections";

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
  rooms?: number | unknown[];
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

interface AdminLink {
  code: string;
  target: string;
  createdAt: string;
  clicks: number;
  hasPassword: boolean;
  custom: boolean;
}

interface AdminRoom {
  code: string;
  files: { name: string; size: number }[];
  hasPassword: boolean;
  createdAt: string;
  expiresAt: string;
  sender_online?: boolean;
  receiver_online?: boolean;
  bytes_relayed?: number;
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

function fmtAgo(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 1000));
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function fmtRemaining(iso: string): string {
  const diff = Math.max(0, Math.floor((Date.parse(iso) - Date.now()) / 1000));
  if (diff <= 0) return "expiring";
  if (diff < 60) return `${diff}s left`;
  return `${Math.floor(diff / 60)}m ${diff % 60}s left`;
}

export function StatusDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);
  const [pingMs, setPingMs] = useState<number | null>(null);
  const [pingHistory, setPingHistory] = useState<number[]>([]);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  // Admin panel state
  const [adminOpen, setAdminOpen] = useState(false);
  const [adminKey, setAdminKey] = useState("");
  const [authed, setAuthed] = useState(false);
  const [links, setLinks] = useState<AdminLink[]>([]);
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [linkQuery, setLinkQuery] = useState("");
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"links" | "rooms">("links");
  const keyInputRef = useRef<HTMLInputElement>(null);

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
        setLastUpdated(Date.now());
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

  // Secret keyboard shortcut: Ctrl+Shift+K opens admin panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "K" || e.key === "k")) {
        e.preventDefault();
        setAdminOpen((v) => !v);
        setTimeout(() => keyInputRef.current?.focus(), 100);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const fetchAdmin = useCallback(
    async (key?: string) => {
      const k = (key ?? adminKey).trim();
      if (!k) return;
      setAdminLoading(true);
      try {
        const r = await fetch("/api/v1/stats", {
          headers: { "x-koza-key": k, "x-koza-admin-key": k },
          cache: "no-store",
        });
        if (r.status === 401 || r.status === 403) {
          toast.error("Invalid admin key");
          setAuthed(false);
          return;
        }
        if (r.ok) {
          const data = await r.json();
          if (data.is_admin === false) {
            toast.error("Invalid admin key");
            setAuthed(false);
            return;
          }
          const rawLinks = Array.isArray(data.links) ? data.links : [];
          const rawRooms = Array.isArray(data.admin_rooms)
            ? data.admin_rooms
            : Array.isArray(data.rooms)
              ? data.rooms
              : [];
          setLinks(
            rawLinks.map((l: Record<string, unknown>) => ({
              code: String(l.code ?? l.slug ?? ""),
              target: String(l.target ?? l.url ?? ""),
              createdAt: String(l.createdAt ?? l.created_at ?? new Date().toISOString()),
              clicks: Number(l.clicks ?? 0),
              hasPassword: Boolean(l.hasPassword ?? l.password),
              custom: Boolean(l.custom),
            })),
          );
          setRooms(
            rawRooms.map((rm: Record<string, unknown>) => ({
              code: String(rm.code ?? ""),
              files: Array.isArray(rm.files) ? rm.files : [],
              hasPassword: Boolean(rm.hasPassword ?? rm.password),
              createdAt: String(rm.createdAt ?? rm.created_at ?? new Date().toISOString()),
              expiresAt: String(rm.expiresAt ?? rm.expires_at ?? new Date().toISOString()),
              sender_online: Boolean(rm.sender_online),
              receiver_online: Boolean(rm.receiver_online),
              bytes_relayed: Number(rm.bytes_relayed ?? 0),
            })),
          );
          setAuthed(true);
        }
      } catch {
        toast.error("Could not reach API");
      } finally {
        setAdminLoading(false);
      }
    },
    [adminKey],
  );

  useEffect(() => {
    if (!authed || !adminOpen) return;
    const id = setInterval(() => fetchAdmin(), 5000);
    return () => clearInterval(id);
  }, [authed, adminOpen, fetchAdmin]);

  const deleteLink = async (code: string) => {
    try {
      const k = adminKey.trim();
      const r = await fetch(`/api/v1/links/${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: { "x-koza-key": k, "x-koza-admin-key": k },
      });
      if (r.ok) {
        setLinks((prev) => prev.filter((l) => l.code !== code));
        toast.success(`Deleted /${code}`);
        fetchStats();
      } else {
        toast.error("Failed to delete link");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const deleteRoom = async (code: string) => {
    try {
      const k = adminKey.trim();
      const r = await fetch(`/api/v1/box/rooms/${encodeURIComponent(code)}`, {
        method: "DELETE",
        headers: { "x-koza-key": k, "x-koza-admin-key": k },
      });
      if (r.ok) {
        setRooms((prev) => prev.filter((rm) => rm.code !== code));
        toast.success(`Closed room ${code}`);
        fetchStats();
      } else {
        toast.error("Failed to close room");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const copyShortLink = async (code: string) => {
    try {
      const origin = typeof window !== "undefined" ? window.location.origin : "https://koza.click";
      await navigator.clipboard.writeText(`${origin}/${code}`);
      setCopiedCode(code);
      toast.success(`Copied /${code}`);
      setTimeout(() => setCopiedCode(null), 1500);
    } catch {
      toast.error("Clipboard unavailable");
    }
  };

  const filteredLinks = useMemo(() => {
    const q = linkQuery.trim().toLowerCase();
    if (!q) return links;
    return links.filter(
      (l) => l.code.toLowerCase().includes(q) || l.target.toLowerCase().includes(q),
    );
  }, [links, linkQuery]);

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
        name: "Turbo Binary Pipe (6x Parallel)",
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
  const activeLines = stats?.active_lines ?? 0;
  const relayedBytes = stats?.transfer_stats?.total_bytes_relayed ?? 0;
  const activeRoomsCount =
    stats?.rooms_count ??
    (typeof stats?.rooms === "number"
      ? stats.rooms
      : Array.isArray(stats?.rooms)
        ? stats.rooms.length
        : 0);
  const totalRoomsCreated = stats?.transfer_stats?.total_rooms_created ?? activeRoomsCount;
  const redirectsCount = Number(stats?.links_count ?? stats?.redirects ?? 0);
  const clicksCount = Number(stats?.total_clicks ?? 0);
  const wsClientsCount = Number(stats?.ws_clients ?? 0);

  return (
    <div className="kz-root flex min-h-dvh flex-col">
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
      <KozaNav />

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 py-10 sm:py-14">
        {/* ── HEADER ROW ─────────────────────────────────────────── */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="kz-mono text-[11px] uppercase tracking-[0.2em] text-[var(--kz-coral)]">
                telemetry · live node
              </span>
              {stats?.version && (
                <span className="kz-key text-[10px]">v{stats.version}</span>
              )}
            </div>
            <h1 className="kz-display mt-1.5 text-[28px] sm:text-[34px]">
              System status
            </h1>
            <p className="kz-mono mt-1 text-[12px] text-[var(--kz-smoke)]">
              real-time health, signaling pipelines, and zero-storage transfer metrics
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchStats(true)}
              className="kz-ghost-btn flex items-center gap-1.5 rounded-lg border border-[var(--kz-hairline)] px-3 py-1.5 text-[11.5px]"
              title="Refresh telemetry now"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-[var(--kz-ash)] ${refreshing ? "animate-spin text-[var(--kz-coral)]" : ""}`}
              />
              <span className="kz-mono">Refresh</span>
            </button>
            <button
              onClick={() => {
                setAdminOpen((v) => !v);
                setTimeout(() => keyInputRef.current?.focus(), 100);
              }}
              className={`kz-ghost-btn flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11.5px] transition-colors ${
                adminOpen || authed
                  ? "border-[rgba(255,99,99,0.45)] bg-[rgba(255,99,99,0.08)] text-[var(--kz-coral)]"
                  : "border-[var(--kz-hairline)]"
              }`}
              title="Toggle admin console (Ctrl+Shift+K)"
            >
              {authed ? (
                <Unlock className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
              ) : (
                <Lock className="h-3.5 w-3.5" />
              )}
              <span className="kz-mono">{authed ? "Admin unlocked" : "Admin"}</span>
            </button>
          </div>
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
                    <span className="kz-mono rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10.5px] text-emerald-400">
                      {pingMs} ms
                    </span>
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
                    <span className="kz-mono text-[11px] text-emerald-400">
                      · {activeLines} paired
                    </span>
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

              {/* 5. Turbo Stream Volume */}
              <div className="p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="kz-mono text-[10.5px] uppercase tracking-wider text-[var(--kz-smoke)]">
                    Turbo Throughput
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
              <span className="kz-mono text-[11px] text-emerald-400">
                {serviceRows.filter((r) => r.ok).length}/{serviceRows.length} online
              </span>
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
                    <span
                      className={`kz-mono flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10.5px] ${
                        row.ok
                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                          : "border-red-500/30 bg-red-500/10 text-red-400"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          row.ok ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      {row.ok ? "ready" : "down"}
                    </span>
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
                    <span className="kz-mono text-[10px] text-emerald-400">
                      LAN / STUN
                    </span>
                  </div>
                  <p className="kz-mono mt-1 text-[11px] leading-relaxed text-[var(--kz-smoke)]">
                    WebRTC DataChannel over direct UDP (`host` / `srflx`) when both peers share an open NAT path.
                  </p>
                </div>

                <div className="kz-inset p-3">
                  <div className="flex items-center justify-between">
                    <span className="kz-mono text-[11.5px] font-medium text-[var(--kz-mist)]">
                      02 · Turbo WSS Pipe
                    </span>
                    <span className="kz-mono text-[10px] text-[var(--kz-coral)]">
                      VPN / CGNAT
                    </span>
                  </div>
                  <p className="kz-mono mt-1 text-[11px] leading-relaxed text-[var(--kz-smoke)]">
                    256 KiB binary frames + 12 MiB sliding window over TLS `:443`. Bypasses TURN-TCP & SCTP throttling.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--kz-hairline)] pt-3">
              <span className="kz-mono flex items-center gap-1.5 text-[11px] text-[var(--kz-smoke)]">
                <HardDrive className="h-3.5 w-3.5 text-[var(--kz-ash)]" />
                Zero-disk retention
              </span>
              <span className="kz-mono text-[10.5px] text-[var(--kz-ash)]">
                RAM pipe only
              </span>
            </div>
          </motion.div>
        </div>

        {/* ── ADMIN CONTROL CONSOLE ─────────────────────────────── */}
        <AnimatePresence>
          {adminOpen && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              transition={{ duration: 0.25 }}
              className="kz-edge mt-6 p-5 sm:p-6"
            >
              <div className="flex items-center justify-between border-b border-[var(--kz-hairline)] pb-3.5">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-[var(--kz-coral)]" />
                  <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-coral)]">
                    Admin Console
                  </span>
                  {authed && (
                    <span className="kz-mono rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400">
                      authenticated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {authed && (
                    <button
                      onClick={() => fetchAdmin()}
                      className="kz-ghost-btn rounded-md p-1.5"
                      title="Refresh admin data"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${adminLoading ? "animate-spin text-[var(--kz-coral)]" : ""}`}
                      />
                    </button>
                  )}
                  <button
                    onClick={() => setAdminOpen(false)}
                    className="kz-ghost-btn rounded-md p-1.5"
                    aria-label="Close admin panel"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {!authed ? (
                <div className="mt-4">
                  <p className="kz-mono mb-3 text-[11.5px] text-[var(--kz-smoke)]">
                    Enter `KOZA_ADMIN_KEY` to inspect and manage shortened links and live P2P transfer rooms.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <div className="kz-inset flex flex-1 items-center gap-2.5 px-3.5 py-2.5">
                      <Lock className="h-3.5 w-3.5 shrink-0 text-[var(--kz-coral)]" />
                      <input
                        ref={keyInputRef}
                        type="password"
                        value={adminKey}
                        onChange={(e) => setAdminKey(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") fetchAdmin();
                        }}
                        placeholder="KOZA_ADMIN_KEY"
                        className="kz-mono w-full bg-transparent text-[13px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                      />
                    </div>
                    <button
                      onClick={() => fetchAdmin()}
                      disabled={adminLoading || !adminKey.trim()}
                      className="kz-cta h-10 shrink-0 px-5 text-xs disabled:opacity-50"
                    >
                      {adminLoading ? "Verifying…" : "Unlock console"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-4">
                  {/* Tabs + Search bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="kz-inset inline-flex p-1">
                      <button
                        onClick={() => setActiveTab("links")}
                        className={`kz-mono rounded-lg px-3 py-1.5 text-[11.5px] transition-colors ${
                          activeTab === "links"
                            ? "bg-white/[0.09] text-[var(--kz-mist)]"
                            : "text-[var(--kz-smoke)] hover:text-[var(--kz-ash)]"
                        }`}
                      >
                        Links ({links.length})
                      </button>
                      <button
                        onClick={() => setActiveTab("rooms")}
                        className={`kz-mono rounded-lg px-3 py-1.5 text-[11.5px] transition-colors ${
                          activeTab === "rooms"
                            ? "bg-white/[0.09] text-[var(--kz-mist)]"
                            : "text-[var(--kz-smoke)] hover:text-[var(--kz-ash)]"
                        }`}
                      >
                        Active Rooms ({rooms.length})
                      </button>
                    </div>

                    {activeTab === "links" && (
                      <div className="kz-inset flex min-w-[220px] flex-1 items-center gap-2 px-3 py-1.5 sm:max-w-xs">
                        <Search className="h-3.5 w-3.5 text-[var(--kz-smoke)]" />
                        <input
                          value={linkQuery}
                          onChange={(e) => setLinkQuery(e.target.value)}
                          placeholder="Filter by code or URL…"
                          className="kz-mono w-full bg-transparent text-[12px] text-[var(--kz-mist)] outline-none placeholder:text-[var(--kz-smoke)]"
                        />
                        {linkQuery && (
                          <button
                            onClick={() => setLinkQuery("")}
                            className="text-[var(--kz-smoke)] hover:text-[var(--kz-mist)]"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* TAB 1: Shortened Links */}
                  {activeTab === "links" && (
                    <div className="mt-3">
                      {filteredLinks.length === 0 ? (
                        <p className="kz-inset kz-mono px-4 py-6 text-center text-[12px] text-[var(--kz-smoke)]">
                          {linkQuery ? "No links match your filter" : "No links stored yet"}
                        </p>
                      ) : (
                        <ul className="kz-inset max-h-80 divide-y divide-[var(--kz-hairline)] overflow-y-auto">
                          {filteredLinks.map((l) => (
                            <li
                              key={l.code}
                              className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-[12px]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="kz-mono font-medium text-[var(--kz-coral)]">
                                    /{l.code}
                                  </span>
                                  {l.hasPassword && (
                                    <span className="kz-mono inline-flex items-center gap-1 rounded bg-[rgba(255,99,99,0.12)] px-1.5 py-0.5 text-[10px] text-[var(--kz-coral)]">
                                      <Lock className="h-2.5 w-2.5" /> locked
                                    </span>
                                  )}
                                  {l.custom && (
                                    <span className="kz-key text-[9.5px]">custom</span>
                                  )}
                                  <span className="kz-mono text-[10.5px] text-[var(--kz-smoke)]">
                                    · {l.clicks} click{l.clicks === 1 ? "" : "s"} · {fmtAgo(l.createdAt)}
                                  </span>
                                </div>
                                <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-ash)]">
                                  {l.target}
                                </p>
                              </div>

                              <div className="flex shrink-0 items-center gap-1">
                                <button
                                  onClick={() => copyShortLink(l.code)}
                                  className="kz-ghost-btn rounded-md p-1.5"
                                  title="Copy short link"
                                >
                                  {copiedCode === l.code ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                <a
                                  href={l.target}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="kz-ghost-btn rounded-md p-1.5"
                                  title="Open target URL"
                                >
                                  <ArrowUpRight className="h-3.5 w-3.5" />
                                </a>
                                <button
                                  onClick={() => deleteLink(l.code)}
                                  className="kz-ghost-btn rounded-md p-1.5 text-[var(--kz-smoke)] hover:text-red-400"
                                  title={`Delete /${l.code}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* TAB 2: Active P2P Rooms */}
                  {activeTab === "rooms" && (
                    <div className="mt-3">
                      {rooms.length === 0 ? (
                        <p className="kz-inset kz-mono px-4 py-6 text-center text-[12px] text-[var(--kz-smoke)]">
                          No active transfer rooms right now
                        </p>
                      ) : (
                        <ul className="kz-inset max-h-80 divide-y divide-[var(--kz-hairline)] overflow-y-auto">
                          {rooms.map((rm) => {
                            const totalBytes = rm.files.reduce((a, f) => a + f.size, 0);
                            return (
                              <li
                                key={rm.code}
                                className="flex items-center justify-between gap-3 px-3.5 py-3 text-[12px]"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="kz-mono font-medium tracking-wider text-[var(--kz-coral)]">
                                      {rm.code}
                                    </span>
                                    {rm.hasPassword && (
                                      <Lock className="h-3 w-3 text-[var(--kz-coral)]" />
                                    )}
                                    <span
                                      className={`kz-mono rounded px-1.5 py-0.5 text-[10px] ${
                                        rm.sender_online
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-white/[0.05] text-[var(--kz-smoke)]"
                                      }`}
                                    >
                                      sender {rm.sender_online ? "online" : "idle"}
                                    </span>
                                    <span
                                      className={`kz-mono rounded px-1.5 py-0.5 text-[10px] ${
                                        rm.receiver_online
                                          ? "bg-emerald-500/10 text-emerald-400"
                                          : "bg-white/[0.05] text-[var(--kz-smoke)]"
                                      }`}
                                    >
                                      receiver {rm.receiver_online ? "online" : "waiting"}
                                    </span>
                                    <span className="kz-mono flex items-center gap-1 text-[10.5px] text-[var(--kz-smoke)]">
                                      <Clock className="h-3 w-3" />
                                      {fmtRemaining(rm.expiresAt)}
                                    </span>
                                  </div>
                                  <p className="kz-mono mt-1 truncate text-[11px] text-[var(--kz-ash)]">
                                    {rm.files.length} file{rm.files.length === 1 ? "" : "s"} (
                                    {fmtSize(totalBytes)})
                                    {rm.bytes_relayed
                                      ? ` · relayed ${fmtSize(rm.bytes_relayed)}`
                                      : ""}{" "}
                                    — {rm.files.map((f) => f.name).join(", ")}
                                  </p>
                                </div>
                                <button
                                  onClick={() => deleteRoom(rm.code)}
                                  className="kz-ghost-btn shrink-0 rounded-md p-1.5 text-[var(--kz-smoke)] hover:text-red-400"
                                  title={`Close room ${rm.code}`}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bottom hint */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 px-1">
          <p className="kz-mono text-[11px] text-[var(--kz-smoke)]">
            {lastUpdated
              ? `last telemetry sync: ${new Date(lastUpdated).toLocaleTimeString()}`
              : "initializing telemetry…"}
          </p>
          <p className="kz-mono text-[11px] text-[var(--kz-smoke)]">
            press <span className="kz-key text-[10px]">Ctrl+Shift+K</span> for admin console
          </p>
        </div>
      </main>

      <KozaFooter />
    </div>
  );
}
