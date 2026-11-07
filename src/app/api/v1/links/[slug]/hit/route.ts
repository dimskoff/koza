import { NextResponse } from "next/server";
import { apiStore } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/* POST /api/v1/links/{slug}/hit — count a click.
   The redirect page at koza.click/{slug} calls this for you. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/links/${encodeURIComponent(slug.toLowerCase())}/hit`);
  if (upstream) return upstream;
  const link = apiStore().links.get(slug.toLowerCase());
  if (!link) {
    return NextResponse.json({ error: "no such link" }, { status: 404 });
  }
  link.clicks += 1;
  return NextResponse.json({ slug: link.slug, clicks: link.clicks });
}
