"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  Activity,
  ArrowUpRight,
  Clock,
  Cpu,
  Globe,
  HardDrive,
  Key,
  Link as LinkIcon,
  Lock,
  MousePointerClick,
  Radio,
  RefreshCw,
  Server,
  Shield,
  ShieldCheck,
  Trash2,
  Users,
  Wifi,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

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
  const [ping, setPing] = useState<number | null>(null);
  const [showSecretModal, setShowSecretModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const pulseCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Check URL param or localStorage on mount
  useEffect(() => {
    let key = "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlKey = params.get("key") || params.get("admin") || params.get("admin_key");
      if (urlKey) {
        key = urlKey.trim();
        localStorage.setItem("koza_admin_key", key);
        // Clean url without reload
        const newUrl = window.location.pathname;
        window.history.replaceState({}, "", newUrl);
        toast.success("Admin key authenticated via URL");
      } else {
        key = localStorage.getItem("koza_admin_key") || "";
      }
    }
    if (key) {
      setAdminKey(key);
      setKeyInput(key);
    }
  }, []);

  // Keyboard shortcut Ctrl+Shift+K to toggle secret modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowSecretModal((v) => !v);
      }
      if (e.key === "Escape") {
        setShowSecretModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchStats = useCallback(async (keyToUse?: string) => {
    setRefreshing(true);
    const key = keyToUse !== undefined ? keyToUse : adminKey;
    const t0 = performance.now();
    try {
      const headers: Record<string, string> = {};
      if (key) headers["x-koza-key"] = key;

      const res = await fetch("/api/v1/stats", { headers });
      const elapsed = Math.round(performance.now() - t0);
      setPing(elapsed);

      if (res.ok) {
        const data = await res.json();
        setStats(data);
      } else {
        toast.error("Telemetry unreachable");
      }
    } catch {
      toast.error("Failed to connect to cluster");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [adminKey]);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 8000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  // Subtle animated canvas heartbeat graph
  useEffect(() => {
    const canvas = pulseCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let step = 0;

    const render = () => {
      step += 0.04;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255, 112, 102, 0.4)";

      const w = canvas.width;
      const h = canvas.height;
      const mid = h / 2;

      for (let x = 0; x < w; x++) {
        // Heartbeat pulse wave simulation
        const wave =
          Math.sin(x * 0.05 - step) * 3 +
          Math.sin(x * 0.02 - step * 0.7) * 4 +
          (Math.exp(-Math.pow((x - ((step * 45) % w)) / 15, 2)) * 12);
        const y = mid + wave;
        if (x === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      animId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleApplyKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keyInput.trim();
    setAdminKey(clean);
    if (clean) {
      localStorage.setItem("koza_admin_key", clean);
      toast.success("Admin credentials verified");
    } else {
      localStorage.removeItem("koza_admin_key");
      toast.info("Switched to public view");
    }
    setShowSecretModal(false);
    fetchStats(clean);
  };

  const handleLogout = () => {
    localStorage.removeItem("koza_admin_key");
    setAdminKey("");
    setKeyInput("");
    toast.info("Logged out from admin console");
    fetchStats("");
  };

  const handleDeleteLink = async (slug: string) => {
    if (!confirm(`Permanently burn short link /${slug}?`)) return;
    try {
      const res = await fetch(`/api/v1/links/${slug}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`Burned /${slug}`);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || "Burn failed");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleDeleteRoom = async (code: string) => {
    if (!confirm(`Terminate active line ${code}?`)) return;
    try {
      const res = await fetch(`/api/v1/box/rooms/${code}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`Closed line ${code}`);
        fetchStats();
      } else {
        const err = await res.json();
        toast.error(err.error || "Close failed");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const filteredLinks = stats?.links?.filter(
    (l) =>
      l.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
      l.url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="w-full max-w-4xl space-y-4">
      {/* ── Top Bar: Cluster Status & Latency ── */}
      <div className="kz-glass relative overflow-hidden rounded-2xl p-4 sm:p-5">
        <canvas
          ref={pulseCanvasRef}
          width={600}
          height={60}
          className="pointer-events-none absolute right-0 top-0 h-full w-2/3 opacity-30 mask-radial"
        />

        <div className="relative z-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            {/* Click 3 times or double click on icon to trigger secret admin modal */}
            <button
              onClick={() => setShowSecretModal(true)}
              title="Cluster node telemetry (double click for admin)"
              className="group relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[var(--kz-hairline)] bg-white/[0.04] transition-all hover:border-[var(--kz-coral)] hover:bg-[var(--kz-coral)]/10"
            >
              <Activity className="h-5 w-5 text-[var(--kz-coral)] transition-transform group-hover:scale-110" />
              <span className="absolute -bottom-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="absolute h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
            </button>

            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-medium tracking-tight text-[var(--kz-mist)]">
                  Node Telemetry
                </h2>
                <span className="kz-mono rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400">
                  ONLINE
                </span>
                {stats?.is_admin && (
                  <span className="kz-mono rounded-md border border-[var(--kz-coral)]/30 bg-[var(--kz-coral)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--kz-coral)]">
                    ROOT
                  </span>
                )}
              </div>
              <p className="kz-mono mt-0.5 flex items-center gap-2 text-[11px] text-[var(--kz-smoke)]">
                <span>🇩🇪 Frankfurt Edge (FR1)</span>
                <span>·</span>
                <span>Up {stats ? formatUptime(stats.uptime_seconds) : "..."}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {ping !== null && (
              <div className="kz-mono flex items-center gap-1.5 rounded-lg border border-[var(--kz-hairline)] bg-black/40 px-2.5 py-1 text-[11px] text-[var(--kz-ash)]">
                <Wifi className="h-3 w-3 text-emerald-400" />
                <span>{ping} ms</span>
              </div>
            )}

            {stats?.is_admin ? (
              <button
                onClick={handleLogout}
                className="kz-mono flex h-8 items-center gap-1.5 rounded-lg border border-[var(--kz-coral)]/30 bg-[var(--kz-coral)]/10 px-3 text-[11px] text-[var(--kz-coral)] hover:bg-[var(--kz-coral)]/20"
                title="Lock session"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>Lock</span>
              </button>
            ) : (
              <button
                onClick={() => setShowSecretModal(true)}
                className="kz-ghost-btn flex h-8 items-center gap-1 rounded-lg px-2 text-[11px] text-[var(--kz-smoke)] hover:text-[var(--kz-mist)]"
                title="Admin Authentication"
              >
                <Lock className="h-3 w-3" />
              </button>
            )}

            <button
              onClick={() => fetchStats()}
              disabled={refreshing}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.04] text-[var(--kz-mist)] transition-colors hover:bg-white/[0.08]"
              title="Refresh telemetry"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-[var(--kz-coral)]" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Primary Metrics Grid ── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {/* Short Links */}
        <div className="kz-glass relative overflow-hidden rounded-xl p-4 transition-all hover:border-white/10">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[10px] tracking-wider">REDIRECTS</span>
            <LinkIcon className="h-3.5 w-3.5 text-[var(--kz-coral)]" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-[var(--kz-mist)]">
              {stats ? stats.links_count : "—"}
            </span>
            <span className="kz-mono text-[10px] text-[var(--kz-ash)]">minted</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400">
            <Zap className="h-2.5 w-2.5" />
            <span className="kz-mono">instant 302</span>
          </div>
        </div>

        {/* Total Clicks */}
        <div className="kz-glass relative overflow-hidden rounded-xl p-4 transition-all hover:border-white/10">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[10px] tracking-wider">CLICK STREAM</span>
            <MousePointerClick className="h-3.5 w-3.5 text-sky-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-[var(--kz-mist)]">
              {stats ? stats.total_clicks : "—"}
            </span>
            <span className="kz-mono text-[10px] text-[var(--kz-ash)]">hits</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--kz-smoke)]">
            <span className="kz-mono">zero fingerprint</span>
          </div>
        </div>

        {/* Active P2P Lines */}
        <div className="kz-glass relative overflow-hidden rounded-xl p-4 transition-all hover:border-white/10">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[10px] tracking-wider">P2P LINES</span>
            <Radio className="h-3.5 w-3.5 text-amber-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-[var(--kz-mist)]">
              {stats ? stats.rooms_count : "—"}
            </span>
            <span className="kz-mono text-[10px] text-[var(--kz-ash)]">active</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            <span className="kz-mono">E2E encrypted</span>
          </div>
        </div>

        {/* Signaling & TURN */}
        <div className="kz-glass relative overflow-hidden rounded-xl p-4 transition-all hover:border-white/10">
          <div className="flex items-center justify-between text-[var(--kz-smoke)]">
            <span className="kz-mono text-[10px] tracking-wider">SIGNAL RELAY</span>
            <Users className="h-3.5 w-3.5 text-emerald-400" />
          </div>
          <div className="mt-2.5 flex items-baseline gap-1.5">
            <span className="text-2xl font-semibold tracking-tight text-[var(--kz-mist)]">
              {stats ? stats.ws_clients : "—"}
            </span>
            <span className="kz-mono text-[10px] text-[var(--kz-ash)]">peers</span>
          </div>
          <div className="mt-1 flex items-center gap-1 text-[10px] text-emerald-400">
            <span className="kz-mono">
              {stats?.turn_enabled ? "TURN active" : "STUN only"}
            </span>
          </div>
        </div>
      </div>

      {/* ── Subsystem Architecture Indicators ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="kz-glass flex items-center gap-3 rounded-xl p-3 text-xs">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
            <Server className="h-4 w-4 text-[var(--kz-coral)]" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">ENGINE</span>
              <span className="kz-mono text-[10px] text-emerald-400">HEALTHY</span>
            </div>
            <p className="kz-mono truncate font-medium text-[var(--kz-mist)]">
              RSS {stats ? `${stats.memory_mb} MB` : "—"} · Node 22
            </p>
          </div>
        </div>

        <div className="kz-glass flex items-center gap-3 rounded-xl p-3 text-xs">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
            <HardDrive className="h-4 w-4 text-sky-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">STORAGE</span>
              <span className="kz-mono text-[10px] text-sky-400">ATOMIC</span>
            </div>
            <p className="kz-mono truncate font-medium text-[var(--kz-mist)]">
              /data/koza.json · Zero DB
            </p>
          </div>
        </div>

        <div className="kz-glass flex items-center gap-3 rounded-xl p-3 text-xs">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03]">
            <Shield className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between">
              <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">SECURITY</span>
              <span className="kz-mono text-[10px] text-emerald-400">ACTIVE</span>
            </div>
            <p className="kz-mono truncate font-medium text-[var(--kz-mist)]">
              Traefik TLS · DTLS-SRTP
            </p>
          </div>
        </div>
      </div>

      {/* ── Admin Management Console ── */}
      {stats?.is_admin && (
        <div className="space-y-4 pt-2">
          {/* Active Lines Panel */}
          {stats.rooms && stats.rooms.length > 0 && (
            <div className="kz-glass rounded-2xl p-4 sm:p-5">
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <Radio className="h-4 w-4 text-[var(--kz-coral)]" />
                  <h3 className="text-sm font-medium text-[var(--kz-mist)]">Live P2P Rooms</h3>
                </div>
                <span className="kz-mono rounded-md bg-white/[0.05] px-2 py-0.5 text-[10px] text-[var(--kz-smoke)]">
                  {stats.rooms.length} active
                </span>
              </div>

              <div className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)]">
                {stats.rooms.map((r) => {
                  const totalSize = (r.files || []).reduce((acc, f) => acc + (f.size || 0), 0);
                  return (
                    <div key={r.code} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="kz-mono font-semibold tracking-widest text-[var(--kz-coral)]">
                            {r.code}
                          </span>
                          {r.password && (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-400 border border-amber-500/20">
                              LOCKED
                            </span>
                          )}
                          <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                            {r.files.length} file{r.files.length !== 1 ? "s" : ""} · {formatBytes(totalSize)}
                          </span>
                        </div>
                        <p className="kz-mono text-[10px] text-[var(--kz-ash)]">
                          Expires: {new Date(r.expires_at).toLocaleTimeString()}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteRoom(r.code)}
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-[var(--kz-hairline)] text-[var(--kz-smoke)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                        title="Close line"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Stored Links Table */}
          {stats.links && stats.links.length > 0 && (
            <div className="kz-glass rounded-2xl p-4 sm:p-5">
              <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <LinkIcon className="h-4 w-4 text-[var(--kz-coral)]" />
                  <h3 className="text-sm font-medium text-[var(--kz-mist)]">Managed Short Links</h3>
                  <span className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                    ({stats.links.length})
                  </span>
                </div>

                <input
                  type="text"
                  placeholder="Filter by slug or target..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="kz-mono h-7 rounded-lg border border-[var(--kz-hairline)] bg-black/40 px-2.5 text-[11px] text-[var(--kz-mist)] placeholder-[var(--kz-ash)] outline-none focus:border-[var(--kz-coral)]"
                />
              </div>

              <div className="divide-y divide-[var(--kz-hairline)] border-t border-[var(--kz-hairline)] max-h-96 overflow-y-auto">
                {filteredLinks && filteredLinks.length > 0 ? (
                  filteredLinks.map((l) => (
                    <div key={l.slug} className="flex items-center justify-between py-2.5 text-xs">
                      <div className="min-w-0 pr-3 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <a
                            href={`/${l.slug}`}
                            target="_blank"
                            rel="noreferrer"
                            className="kz-mono font-medium text-[var(--kz-mist)] hover:text-[var(--kz-coral)] flex items-center gap-1"
                          >
                            /{l.slug} <ArrowUpRight className="h-2.5 w-2.5" />
                          </a>
                          {l.password && (
                            <span className="rounded bg-amber-500/10 px-1 py-0.2 text-[9px] text-amber-400 border border-amber-500/20">
                              pass
                            </span>
                          )}
                          <span className="kz-mono text-[10px] text-[var(--kz-smoke)]">
                            {l.clicks} hit{l.clicks !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="truncate text-[10px] text-[var(--kz-ash)] max-w-md" title={l.url}>
                          → {l.url}
                        </p>
                      </div>

                      <button
                        onClick={() => handleDeleteLink(l.slug)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-[var(--kz-hairline)] text-[var(--kz-smoke)] hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-400"
                        title="Burn link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="py-4 text-center text-xs text-[var(--kz-ash)]">No links match filter</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Discreet Secret Admin Modal ── */}
      <AnimatePresence>
        {showSecretModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-md">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="kz-glass w-full max-w-md overflow-hidden rounded-2xl border border-[var(--kz-hairline)] p-5 shadow-2xl"
            >
              <div className="flex items-center justify-between pb-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--kz-coral)]/10 text-[var(--kz-coral)]">
                    <Key className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-medium text-[var(--kz-mist)]">
                    Authenticate Instance
                  </h3>
                </div>
                <button
                  onClick={() => setShowSecretModal(false)}
                  className="rounded-lg p-1 text-[var(--kz-smoke)] hover:bg-white/[0.05] hover:text-[var(--kz-mist)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <form onSubmit={handleApplyKey} className="space-y-3 pt-2">
                <div>
                  <label className="kz-mono mb-1.5 block text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                    Admin Key (KOZA_ADMIN_KEY)
                  </label>
                  <input
                    type="password"
                    placeholder="Paste instance key..."
                    autoFocus
                    value={keyInput}
                    onChange={(e) => setKeyInput(e.target.value)}
                    className="kz-mono h-10 w-full rounded-xl border border-[var(--kz-hairline)] bg-black/60 px-3 text-xs text-[var(--kz-mist)] placeholder-[var(--kz-ash)] outline-none focus:border-[var(--kz-coral)] focus:ring-1 focus:ring-[var(--kz-coral)]"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setKeyInput("");
                      setShowSecretModal(false);
                    }}
                    className="kz-mono h-8 rounded-lg border border-[var(--kz-hairline)] px-3 text-[11px] text-[var(--kz-smoke)] hover:bg-white/[0.05]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="kz-cta h-8 rounded-lg px-4 text-[12px] font-medium"
                  >
                    Unlock
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
