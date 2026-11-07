import { NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/* GET /api/v1/turn — short-lived turn credentials for the p2p handshake.
   The backend (server.js) hmac-signs them against coturn's shared secret.
   With no turn configured (local dev without coturn) this returns null and
   the box falls back to stun-only ice. */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/turn");
  if (upstream) return upstream;
  return NextResponse.json({ turn: null, note: "no turn on this server — stun only" });
}
