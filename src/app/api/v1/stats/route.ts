import { NextResponse } from "next/server";
import { apiStore, publicLink, publicRoom } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/* GET /api/v1/stats — system stats & link/room counts */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/stats");
  if (upstream) return upstream;

  const store = apiStore();
  const allLinks = [...store.links.values()];
  const totalClicks = allLinks.reduce((acc, l) => acc + (l.clicks || 0), 0);
  const activeRooms = [...store.rooms.values()].map(publicRoom);

  const adminKey = process.env.KOZA_ADMIN_KEY || "";
  const authHeader = req.headers.get("x-koza-key") || "";
  const isAdmin = !adminKey || (authHeader && authHeader === adminKey);

  return NextResponse.json({
    links_count: allLinks.length,
    total_clicks: totalClicks,
    rooms_count: activeRooms.length,
    uptime_seconds: Math.floor(process.uptime()),
    memory_mb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    turn_enabled: false,
    ws_clients: 0,
    is_admin: isAdmin,
    links: isAdmin ? allLinks.sort((a, b) => b.createdAt - a.createdAt).map(publicLink) : undefined,
    rooms: isAdmin ? activeRooms : undefined,
  });
}
