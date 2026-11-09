// SPDX-License-Identifier: MPL-2.0
import { NextResponse } from "next/server";
import { apiStore, publicLink } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

/* GET /api/v1/links — every link on this server, newest first. */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/links");
  if (upstream) return upstream;
  const links = [...apiStore().links.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((l) => publicLink(l, false));
  return NextResponse.json({ count: links.length, links });
}
