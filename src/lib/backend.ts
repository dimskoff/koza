/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { NextResponse } from "next/server";

export const UPSTREAM = (process.env.KOZA_API_URL || "").replace(/\/+$/, "") || null;

export async function proxyToBackend(
  req: Request,
  path: string,
): Promise<NextResponse | null> {
  if (!UPSTREAM) return null;

  const headers = new Headers();
  for (const name of [
    "x-koza-token",
    "x-koza-key",
    "x-koza-admin-key",
    "x-koza-password",
    "authorization",
    "x-forwarded-for",
  ]) {
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
