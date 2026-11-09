// SPDX-License-Identifier: MPL-2.0
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase();
  const { pathname } = req.nextUrl;

  /* On box.koza.click:
     - `/` rewrites cleanly to `/box`
     - `/box` redirects to `https://box.koza.click/` so `/box` never appears in the URL bar */
  if (host.startsWith("box.")) {
    if (pathname === "/") {
      const url = req.nextUrl.clone();
      url.pathname = "/box";
      return NextResponse.rewrite(url);
    }
    if (pathname === "/box" || pathname === "/box/") {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url, 308);
    }
  }

  /* On koza.click (production):
     - `/box` redirects to `https://box.koza.click` so `koza.click/box` never exists */
  if (host === "koza.click" || host === "www.koza.click") {
    if (pathname === "/box" || pathname === "/box/") {
      return NextResponse.redirect("https://box.koza.click", 308);
    }
    if (pathname.startsWith("/r/")) {
      return NextResponse.redirect(`https://box.koza.click${pathname}`, 308);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/", "/box", "/box/:path*", "/r/:path*"],
};
