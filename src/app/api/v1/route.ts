import { NextResponse } from "next/server";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/* GET /api/v1 — the index. Machine-readable map of the whole api. */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1");
  if (upstream) return upstream;
  return NextResponse.json({
    name: "koza api",
    version: "v1",
    base_url: "https://koza.click/api/v1",
    description:
      "Short links and direct file lines over plain HTTP. No keys, no tokens — be nice.",
    docs: "https://koza.click/docs",
    endpoints: {
      shortener: {
        "POST /shorten": "create a short link — { url, slug?, password? }",
        "GET /links": "list every link on this server",
        "GET /links/{slug}": "look up one link, clicks included",
        "POST /links/{slug}/hit": "count a click (the redirect page does this for you)",
        "POST /links/{slug}/unlock": "trade a password for the destination url",
        "DELETE /links/{slug}": "burn a link",
      },
      box: {
        "POST /box/rooms": "open a direct line — { password?, files?: [{ name, size }] }",
        "GET /box/rooms/{code}": "inspect a line: staged files, lock state, expiry",
        "DELETE /box/rooms/{code}": "close the line early",
        "GET /turn": "short-lived turn credentials for the webrtc handshake",
      },
    },
    notes: [
      "in-memory demo store — resets when the server process does",
      "rooms expire after one hour",
      "passwords are stored as a tiny demo digest, never in plain text",
    ],
  });
}
