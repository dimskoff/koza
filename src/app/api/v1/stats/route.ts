import os from "node:os";
import { NextResponse } from "next/server";
import { apiStore, publicLink, publicRoom } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/* GET /api/v1/stats — system stats, node health & link/room counts */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/stats");
  if (upstream) return upstream;

  const store = apiStore();
  const allLinks = [...store.links.values()];
  const totalClicks = allLinks.reduce((acc, l) => acc + (l.clicks || 0), 0);
  const activeRooms = [...store.rooms.values()].map(publicRoom);
  const mem = process.memoryUsage();

  const adminKey = process.env.KOZA_ADMIN_KEY || "";
  const authHeader = req.headers.get("x-koza-key") || "";
  const isAdmin = Boolean(!adminKey || (authHeader && authHeader === adminKey));

  return NextResponse.json({
    status: "operational",
    version: "2.1.0",
    server_time: new Date().toISOString(),
    links_count: allLinks.length,
    total_clicks: totalClicks,
    rooms_count: activeRooms.length,
    active_lines: 0,
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(mem.rss / 1024 / 1024),
    memory: {
      rss_mb: Math.round(mem.rss / 1024 / 1024),
      heap_used_mb: Math.round(mem.heapUsed / 1024 / 1024),
      heap_total_mb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    cpu_cores: os.cpus()?.length || 1,
    load_avg: os.loadavg().map((n) => Number(n.toFixed(2))),
    turn_enabled: false,
    ws_clients: 0,
    transfer_stats: {
      total_rooms_created: activeRooms.length,
      total_bytes_relayed: 0,
      total_frames_relayed: 0,
      active_streams: 0,
    },
    services: {
      http_api: "operational",
      ws_signal: "operational",
      turbo_relay: "operational",
      turn_ice: "stun-only",
      storage: "operational",
    },
    is_admin: isAdmin,
    links: isAdmin ? allLinks.sort((a, b) => b.createdAt - a.createdAt).map(publicLink) : undefined,
    rooms: isAdmin ? activeRooms : undefined,
  });
}
