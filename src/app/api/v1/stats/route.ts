// SPDX-License-Identifier: MPL-2.0
import os from "node:os";
import { NextResponse } from "next/server";
import { apiStore, publicRoom } from "@/lib/api-store";
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

  return NextResponse.json({
    status: "operational",
    version: "2.2.0",
    server_time: new Date().toISOString(),
    node_version: process.version,
    platform: `${process.platform}/${process.arch}`,
    links_count: allLinks.length,
    redirects: allLinks.length,
    total_clicks: totalClicks,
    rooms_count: activeRooms.length,
    rooms: activeRooms.length,
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
      http_api: { ok: true, status: "operational", label: "Edge redirect & room registry" },
      ws_signaling: { ok: true, status: "operational", label: "Real-time WebRTC SDP & ICE broker" },
      turbo_relay: { ok: true, status: "operational", label: "Zero-copy TLS :443 binary stream relay" },
      turn_ice: { ok: true, status: "stun-only", label: "STUN only" },
      storage: { ok: true, status: "operational", label: "Atomic link store · zero-disk file policy" },
    },
  });
}
