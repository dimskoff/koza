"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock,
  HardDrive,
  Key,
  Link as LinkIcon,
  MousePointerClick,
  Radio,
  RefreshCw,
  Shield,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { KOZA_REPO } from "../GithubLink";

interface StatsData {
  links_count: number;
  total_clicks: number;
  rooms_count: number;
  uptime_seconds: number;
  memory_mb: number;
  turn_enabled: boolean;
  ws_clients: number;
  is_admin: boolean;
  links?: Array<{
    slug: string;
    url: string;
    short_url: string;
    password: boolean;
    clicks: number;
    created_at: string;
  }>;
  rooms?: Array<{
    code: string;
    url: string;
    password: boolean;
    files: Array<{ name: string; size: number }>;
    created_at: string;
    expires_at: string;
  }>;
}

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function StatusDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("koza_admin_key") || "";
    if (saved) {
      setAdminKey(saved);
      setKeyInput(saved);
    }
  }, []);

  const fetchStats = async (keyToUse?: string) => {
    setRefreshing(true);
    const key = keyToUse !== undefined ? keyToUse : adminKey;
    try {
      const headers: Record<string, string> = {};
      if (key) headers["x-koza-key"] = key;

      const res = await fetch("/api/v1/stats", { headers });
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        toast.error("Failed to load server stats");
      }
    } catch {
      toast.error("Network error while querying stats");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 10000);
    return () => clearInterval(interval);
  }, [adminKey]);

  const handleApplyKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keyInput.trim();
    setAdminKey(clean);
    if (clean) {
      localStorage.setItem("koza_admin_key", clean);
      toast.success("Admin key applied");
    } else {
      localStorage.removeItem("koza_admin_key");
      toast.info("Cleared admin key (public view)");
    }
    fetchStats(clean);
  };

  const handleDeleteLink = async (slug: string) => {
    if (!confirm(`Delete short link /${slug}?`)) return;
    try {
      const res = await fetch(`/api/v1/links/${slug}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`Deleted /${slug}`);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || "Delete failed");
      }
    } catch {
      toast.error("Failed to delete link");
    }
  };

  const handleDeleteRoom = async (code: string) => {
    if (!confirm(`Close room line ${code}?`)) return;
    try {
      const res = await fetch(`/api/v1/box/rooms/${code}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`Closed room ${code}`);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || "Close failed");
      }
    } catch {
      toast.error("Failed to close room");
    }
  };

  return (
    <div className="w-full max-w-4xl space-y-6">
      {/* Top Header & Admin Gate */}
      <div className="kz-glass flex flex-col gap-4 rounded-2xl p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04]">
            <Activity className="h-5 w-5 text-[var(--kz-coral)]" />
          </div>
          <div>
            <h2 className="text-base font-medium text-[var(--kz-mist)]">System Health & Metrics</h2>
            <p className="kz-mono text-[12px] text-[var(--kz-smoke)]">
              {stats ? `Uptime: ${formatUptime(stats.uptime_seconds)}` : "Connecting to telemetry..."}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <form onSubmit={handleApplyKey} className="flex items-center gap-1.5">
            <div className="relative">
              <Key className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--kz-ash)]" />
              <input
                type="password"
                placeholder="Admin key (optional)"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="kz-mono h-8 rounded-lg border border-[var(--kz-hairline)] bg-black/40 pl-8 pr-2.5 text-[11px] text-[var(--kz-mist)] placeholder-[var(--kz-ash)] outline-none focus:border-[var(--kz-coral)] focus:ring-1 focus:ring-[var(--kz-coral)]"
              />
            </div>
            <button
              type="submit"
              className="kz-mono h-8 rounded-lg border border-[var(--kz-hairline)] bg-white/[0.05] px-2.5 text-[11px] text-[var(--kz-mist)] hover:bg-white/[0.08]"
            >
              {adminKey ? "Update" : "Unlock"}
            </button>
          </form>

          <button
            onClick={() => fetchStats()}
            disabled={refreshing}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.05] text-[var(--kz-mist)] hover:bg-white/[0.08]"
            title="Refresh metrics"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--kz-coral)]" : ""}`} />
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="kz-glass rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[11px]">SHORT LINKS</span>
            <LinkIcon className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--kz-mist)]">
            {stats ? stats.links_count : "-"}
          </p>
          <span className="kz-mono text-[10px] text-[var(--kz-ash)]">active redirects</span>
        </div>

        <div className="kz-glass rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[11px]">TOTAL CLICKS</span>
            <MousePointerClick className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--kz-mist)]">
            {stats ? stats.total_clicks : "-"}
          </p>
          <span className="kz-mono text-[10px] text-[var(--kz-ash)]">counted hits</span>
        </div>

        <div className="kz-glass rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[11px]">ACTIVE LINES</span>
            <Radio className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--kz-mist)]">
            {stats ? stats.rooms_count : "-"}
          </p>
          <span className="kz-mono text-[10px] text-[var(--kz-ash)]">live P2P rooms</span>
        </div>

        <div className="kz-glass rounded-xl p-4">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[11px]">WS SIGNAL</span>
            <Users className="h-4 w-4" />
          </div>
          <p className="mt-2 text-2xl font-semibold text-[var(--kz-mist)]">
            {stats ? stats.ws_clients : "-"}
          </p>
          <span className="kz-mono text-[10px] text-[var(--kz-ash)]">
            {stats?.turn_enabled ? "TURN: active" : "STUN only"}
          </span>
        </div>
      </div>

      {/* System info bar */}
      {stats && (
        <div className="kz-glass flex flex-wrap items-center justify-between gap-4 rounded-xl px-4 py-2.5 text-[11px] text-[var(--kz-smoke)]">
          <div className="flex items-center gap-2">
            <HardDrive className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
            <span className="kz-mono">Memory RSS: {stats.memory_mb} MB</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5 text-emerald-400" />
            <span className="kz-mono">Uptime: {formatUptime(stats.uptime_seconds)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Shield className="h-3.5 w-3.5 text-sky-400" />
            <span className="kz-mono">Mode: {stats.is_admin ? "Admin unlocked" : "Public view"}</span>
          </div>
        </div>
      )}

      {/* Admin Protected: Active Rooms Section */}
      {stats?.is_admin && stats.rooms && stats.rooms.length > 0 && (
        <div className="kz-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--kz-mist)]">Active File Transfer Lines</h3>
            <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
              {stats.rooms.length} room{stats.rooms.length > 1 ? "s" : ""}
            </span>
          </div>

          <div className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)]">
            {stats.rooms.map((r) => {
              const totalSize = (r.files || []).reduce((acc, f) => acc + (f.size || 0), 0);
              return (
                <div key={r.code} className="flex items-center justify-between py-3 text-xs">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="kz-mono font-semibold text-[var(--kz-coral)] tracking-wider">
                        {r.code}
                      </span>
                      {r.password && (
                        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                          locked
                        </span>
                      )}
                      <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                        {r.files.length} file{r.files.length !== 1 ? "s" : ""} ({formatBytes(totalSize)})
                      </span>
                    </div>
                    <p className="kz-mono truncate text-[11px] text-[var(--kz-ash)]">
                      Created: {new Date(r.created_at).toLocaleTimeString()} · Expires:{" "}
                      {new Date(r.expires_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDeleteRoom(r.code)}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--kz-hairline)] text-[var(--kz-smoke)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                    title="Close room"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Protected: Short Links Table */}
      {stats?.is_admin && stats.links && stats.links.length > 0 && (
        <div className="kz-glass rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-[var(--kz-mist)]">All Stored Links</h3>
            <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
              {stats.links.length} total
            </span>
          </div>

          <div className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)] max-h-96 overflow-y-auto">
            {stats.links.map((l) => (
              <div key={l.slug} className="flex items-center justify-between py-3 text-xs">
                <div className="min-w-0 space-y-1 pr-3">
                  <div className="flex items-center gap-2">
                    <a
                      href={`/${l.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="kz-mono font-medium text-[var(--kz-mist)] hover:text-[var(--kz-coral)] flex items-center gap-1"
                    >
                      /{l.slug} <ArrowUpRight className="h-3 w-3" />
                    </a>
                    {l.password && (
                      <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400 border border-amber-500/20">
                        password
                      </span>
                    )}
                    <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                      {l.clicks} click{l.clicks !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <p className="truncate text-[11px] text-[var(--kz-ash)]" title={l.url}>
                    → {l.url}
                  </p>
                </div>
                <button
                  onClick={() => handleDeleteLink(l.slug)}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--kz-hairline)] text-[var(--kz-smoke)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                  title="Burn link"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {!stats?.is_admin && (
        <div className="kz-inset rounded-xl p-4 text-center">
          <p className="kz-mono text-[11px] text-[var(--kz-smoke)]">
            Viewing public telemetry. Enter your instance <span className="text-[var(--kz-coral)]">KOZA_ADMIN_KEY</span> above to inspect and manage individual links and lines.
          </p>
        </div>
      )}
    </div>
  );
}
