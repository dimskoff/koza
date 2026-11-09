// SPDX-License-Identifier: MPL-2.0
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  const { pathname } = req.nextUrl;

  // On box.koza.click:
  // - If someone hits `/box` or `/box/`, redirect cleanly to `https://box.koza.click/`
  if (host.startsWith("box.")) {
    if (pathname === "/box" || pathname === "/box/") {
      return NextResponse.redirect(new URL("/", req.url), 308);
    }
  }

  // On koza.click (or any non-box host):
  // - If someone hits `/box`, redirect to `https://box.koza.click/`
  // - If someone hits `/r/:code` (receiver link), redirect to `https://box.koza.click/r/:code`
  if (!host.startsWith("box.")) {
    if (pathname === "/box" || pathname === "/box/") {
      return NextResponse.redirect("https://box.koza.click/", 308);
    }
    if (pathname.startsWith("/r/")) {
      return NextResponse.redirect(`https://box.koza.click${pathname}`, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/box", "/box/", "/r/:path*"],
};
