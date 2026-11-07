/* Thin bridge between the Next.js api routes and the koza backend
   (server/server.js — persistent json storage + signaling).

   Set KOZA_API_URL in production (e.g. http://koza-api:8787 on the
   dokploy overlay network) and every /api/v1 handler below becomes a
   pass-through: links survive restarts, rooms live in the same process
   as the websocket signaling.  With no KOZA_API_URL (local dev) the
   routes fall back to the in-memory demo store in api-store.ts. */

import { NextResponse } from "next/server";

export const UPSTREAM = (process.env.KOZA_API_URL || "").replace(/\/+$/, "") || null;

export async function proxyToBackend(
  req: Request,
  path: string,
): Promise<NextResponse | null> {
  if (!UPSTREAM) return null;

  const headers = new Headers();
  /* forward the auth headers the backend checks — without these the
     sender can't close its own line (DELETE x-koza-token) and admin
     key calls (x-koza-key) would all bounce with 401 */
  for (const name of ["x-koza-token", "x-koza-key", "authorization"]) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }
  const host = req.headers.get("host");
  if (host) headers.set("x-forwarded-host", host);
  const proto =
    req.headers.get("x-forwarded-proto") ||
    (host && !host.startsWith("localhost") && !host.startsWith("127.") ? "https" : "http");
  headers.set("x-forwarded-proto", proto);

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await req.text();
    if (body) headers.set("content-type", "application/json");
  }

  try {
    const r = await fetch(`${UPSTREAM}${path}`, {
      method: req.method,
      headers,
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const text = await r.text();
    return new NextResponse(text || "{}", {
      status: r.status,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    });
  } catch {
    return NextResponse.json(
      { error: "koza backend is not responding" },
      { status: 502 },
    );
  }
}
