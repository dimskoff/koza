import { NextResponse } from "next/server";

/* /api is shorthand — send curious humans and curl scripts to v1 */
export function GET(req: Request) {
  return NextResponse.redirect(new URL("/api/v1", req.url), 307);
}
