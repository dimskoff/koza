"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ArrowUpRight,
  Check,
  Key,
  Lock,
  RefreshCw,
  Trash2,
  X,
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
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function StatusDashboard() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [adminKey, setAdminKey] = useState("");
  const [keyInput, setKeyInput] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [showKeyModal, setShowKeyModal] = useState(false);

  // Authenticate from URL param (?key=...) or localStorage
  useEffect(() => {
    let key = "";
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const urlKey = params.get("key") || params.get("admin") || params.get("admin_key");
      if (urlKey) {
        key = urlKey.trim();
        localStorage.setItem("koza_admin_key", key);
        window.history.replaceState({}, "", window.location.pathname);
        toast.success("Admin authenticated");
      } else {
        key = localStorage.getItem("koza_admin_key") || "";
      }
    }
    if (key) {
      setAdminKey(key);
      setKeyInput(key);
    }
  }, []);

  // Shortcut Ctrl+Shift+K to open admin key prompt
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setShowKeyModal((v) => !v);
      }
      if (e.key === "Escape") {
        setShowKeyModal(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const fetchStats = useCallback(
    async (keyToUse?: string) => {
      setRefreshing(true);
      const key = keyToUse !== undefined ? keyToUse : adminKey;
      try {
        const headers: Record<string, string> = {};
        if (key) headers["x-koza-key"] = key;

        const res = await fetch("/api/v1/stats", { headers });
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch {
        // silent fail to avoid spamming toasts
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [adminKey]
  );

  useEffect(() => {
    fetchStats();
    const interval = setInterval(() => fetchStats(), 10000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  const handleApplyKey = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = keyInput.trim();
    if (!clean) return;
    localStorage.setItem("koza_admin_key", clean);
    setAdminKey(clean);
    setShowKeyModal(false);
    fetchStats(clean);
    toast.success("Admin key applied");
  };

  const handleLogout = () => {
    localStorage.removeItem("koza_admin_key");
    setAdminKey("");
    setKeyInput("");
    fetchStats("");
    toast("Admin signed out");
  };

  const handleDeleteLink = async (slug: string) => {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/v1/links/${slug}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`/${slug} deleted`);
        fetchStats();
      } else {
        toast.error("Could not delete link");
      }
    } catch {
      toast.error("Network error");
    }
  };

  const handleDeleteRoom = async (code: string) => {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/v1/rooms/${code}`, {
        method: "DELETE",
        headers: { "x-koza-key": adminKey },
      });
      if (res.ok) {
        toast.success(`Room ${code} closed`);
        fetchStats();
      } else {
        toast.error("Could not close room");
      }
    } catch {
      toast.error("Network error");
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      {/* ── Top Status Card ── */}
      <div className="kz-edge p-4 sm:p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500"></span>
            </span>
            <div>
              <p className="text-[13px] font-medium text-[var(--kz-mist)]">
                All systems normal
              </p>
              <p className="kz-mono mt-0.5 text-[11px] text-[var(--kz-smoke)]">
                Frankfurt · up {stats ? formatUptime(stats.uptime_seconds) : "…"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => fetchStats()}
              disabled={refreshing}
              className="kz-ghost-btn rounded-lg p-2 text-[var(--kz-smoke)] transition-transform active:rotate-180"
              aria-label="Refresh status"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
              />
            </button>
            <button
              onClick={() => setShowKeyModal(true)}
              className="kz-ghost-btn rounded-lg p-2 text-[var(--kz-smoke)] opacity-40 hover:opacity-100"
              aria-label="Admin unlock"
              title="Admin access"
            >
              <Lock className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* ── 4 Minimal Metrics ── */}
        <div className="kz-hairline-t mt-4 grid grid-cols-4 pt-3 text-center sm:text-left">
          <div className="pr-2">
            <span className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
              Redirects
            </span>
            <p className="kz-mono mt-1 text-lg font-medium text-[var(--kz-mist)]">
              {stats?.links_count ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="px-2">
            <span className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
              Clicks
            </span>
            <p className="kz-mono mt-1 text-lg font-medium text-[var(--kz-mist)]">
              {stats?.total_clicks ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="px-2">
            <span className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
              P2P Lines
            </span>
            <p className="kz-mono mt-1 text-lg font-medium text-[var(--kz-mist)]">
              {stats?.rooms_count ?? (loading ? "…" : 0)}
            </p>
          </div>
          <div className="pl-2">
            <span className="kz-mono text-[10px] uppercase tracking-wider text-[var(--kz-smoke)]">
              Signal
            </span>
            <p className="kz-mono mt-1 text-lg font-medium text-emerald-400">
              {stats?.turn_enabled ? "Active" : "Ready"}
            </p>
          </div>
        </div>
      </div>

      {/* ── Admin Mode View (only shown when authorized) ── */}
      {stats?.is_admin && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between px-1">
            <span className="kz-mono flex items-center gap-1.5 text-[11px] text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
              Admin mode
            </span>
            <button
              onClick={handleLogout}
              className="kz-mono text-[11px] text-[var(--kz-smoke)] hover:text-red-400"
            >
              Sign out
            </button>
          </div>

          {/* Links list */}
          <div className="kz-edge kz-scroll max-h-72 overflow-y-auto">
            {stats.links && stats.links.length > 0 ? (
              <ul className="divide-y divide-[var(--kz-hairline)]">
                {stats.links.map((link) => (
                  <li
                    key={link.slug}
                    className="group flex items-center justify-between px-4 py-2.5 transition-colors hover:bg-white/[0.02]"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <div className="flex items-center gap-2">
                        <a
                          href={`/${link.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="kz-mono flex items-center gap-1 text-[13px] text-[var(--kz-mist)] hover:text-[var(--kz-coral)]"
                        >
                          /{link.slug}
                          <ArrowUpRight className="h-3 w-3 opacity-60" />
                        </a>
                        <span className="kz-mono text-[10.5px] text-[var(--kz-smoke)]">
                          · {link.clicks} {link.clicks === 1 ? "click" : "clicks"}
                        </span>
                      </div>
                      <p className="kz-mono mt-0.5 truncate text-[11px] text-[var(--kz-smoke)]">
                        {link.url}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteLink(link.slug)}
                      className="rounded-lg p-1.5 text-[var(--kz-smoke)] opacity-40 transition-opacity hover:bg-red-500/10 hover:text-red-400 hover:opacity-100"
                      title="Delete link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="py-6 text-center">
                <p className="kz-mono text-xs text-[var(--kz-smoke)]">
                  No active short links
                </p>
              </div>
            )}
          </div>

          {/* Rooms list if any */}
          {stats.rooms && stats.rooms.length > 0 && (
            <div className="kz-edge kz-scroll max-h-48 overflow-y-auto">
              <ul className="divide-y divide-[var(--kz-hairline)]">
                {stats.rooms.map((room) => (
                  <li
                    key={room.code}
                    className="flex items-center justify-between px-4 py-2.5"
                  >
                    <div className="min-w-0 flex-1 pr-3">
                      <p className="kz-mono text-[13px] text-[var(--kz-mist)]">
                        line #{room.code}
                      </p>
                      <p className="kz-mono text-[11px] text-[var(--kz-smoke)]">
                        {room.files?.length ?? 0} files · expires{" "}
                        {new Date(room.expires_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteRoom(room.code)}
                      className="rounded-lg p-1.5 text-[var(--kz-smoke)] opacity-40 hover:bg-red-500/10 hover:text-red-400 hover:opacity-100"
                      title="Close room"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </motion.div>
      )}

      {/* ── Discreet Key Input Modal ── */}
      <AnimatePresence>
        {showKeyModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
            onClick={() => setShowKeyModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="kz-key w-full max-w-sm p-5"
            >
              <div className="flex items-center justify-between">
                <span className="kz-mono text-[11px] uppercase tracking-wider text-[var(--kz-smoke)]">
                  Instance Key
                </span>
                <button
                  onClick={() => setShowKeyModal(false)}
                  className="kz-ghost-btn rounded-lg p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              <form onSubmit={handleApplyKey} className="mt-4 space-y-3">
                <input
                  type="password"
                  placeholder="KOZA_ADMIN_KEY…"
                  autoFocus
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  className="kz-mono h-9 w-full rounded-lg border border-[var(--kz-hairline)] bg-white/[0.03] px-3 text-xs text-[var(--kz-mist)] outline-none focus:border-[var(--kz-coral)]"
                />
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="kz-ghost-btn rounded-lg px-3 py-1.5 text-xs text-[var(--kz-smoke)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="kz-cta rounded-lg px-3.5 py-1.5 text-xs"
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
