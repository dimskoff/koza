// SPDX-License-Identifier: MPL-2.0
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getSite, isBoxHost } from "@/lib/site";

/* On the main host, box URLs (/box, /r/:code) belong to the box host. */
export function proxy(req: NextRequest) {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (isBoxHost(host)) return NextResponse.next();

  const { pathname } = req.nextUrl;
  /* in local dev the box host is box.localhost:3000 — browsers resolve it to 127.0.0.1 */
  const { boxUrl } = getSite();
  if (pathname === "/box" || pathname === "/box/") {
    return NextResponse.redirect(`${boxUrl}/`, 308);
  }
  if (pathname.startsWith("/r/")) {
    return NextResponse.redirect(`${boxUrl}${pathname}`, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/box", "/box/", "/r/:path*"],
};
