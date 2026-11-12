/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/* The Next.js app holds no state of its own: every /api/v1/* call is
 * forwarded verbatim to the koza api service (server/server.js). */

export const API_URL = (process.env.KOZA_API_URL || "http://127.0.0.1:8787").replace(/\/+$/, "");

const FORWARD_REQUEST_HEADERS = [
  "content-type",
  "x-koza-token",
  "x-koza-key",
  "x-koza-password",
  "x-forwarded-for",
  "x-real-ip",
  "user-agent",
];

const FORWARD_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-disposition",
  "retry-after",
];

/* Long-lived relay streams must not be cut by the request timeout. */
const isStreamPath = (path: string) => path.startsWith("/api/v1/box/stream/");

export async function proxyToBackend(req: Request, path: string): Promise<Response> {
  const headers = new Headers();
  for (const name of FORWARD_REQUEST_HEADERS) {
    const v = req.headers.get(name);
    if (v) headers.set(name, v);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
  };
  if (hasBody) {
    init.body = req.body;
    init.duplex = "half";
  }
  if (!isStreamPath(path)) init.signal = AbortSignal.timeout(10_000);

  try {
    const upstream = await fetch(`${API_URL}${path}`, init);
    const out = new Headers({ "cache-control": "no-store" });
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const v = upstream.headers.get(name);
      if (v) out.set(name, v);
    }
    return new Response(upstream.body, { status: upstream.status, headers: out });
  } catch {
    return Response.json({ error: "koza backend is not responding" }, { status: 502 });
  }
}
