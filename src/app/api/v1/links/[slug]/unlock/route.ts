import { NextResponse } from "next/server";
import { apiHashPass, apiStore } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/* POST /api/v1/links/{slug}/unlock — trade the password for the url.
   body: { password: string }  →  200 { url }  |  403 wrong password */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/unlock`);
  if (upstream) return upstream;
  const link = apiStore().links.get(slug.toLowerCase());
  if (!link) {
    return NextResponse.json({ error: "no such link" }, { status: 404 });
  }
  if (!link.passwordHash) {
    return NextResponse.json({ url: link.url, unlocked: true });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be json" }, { status: 400 });
  }
  const { password } = (body ?? {}) as { password?: string };

  if (!password || apiHashPass(password) !== link.passwordHash) {
    return NextResponse.json({ error: "wrong password" }, { status: 403 });
  }
  return NextResponse.json({ url: link.url, unlocked: true });
}
