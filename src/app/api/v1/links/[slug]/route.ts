import { NextResponse } from "next/server";
import { apiStore, publicLink } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

/* GET /api/v1/links/{slug} — look one up (clicks included). */
export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/links/${encodeURIComponent(slug.toLowerCase())}`);
  if (upstream) return upstream;
  const link = apiStore().links.get(slug.toLowerCase());
  if (!link) {
    return NextResponse.json({ error: "no such link" }, { status: 404 });
  }
  return NextResponse.json({ link: publicLink(link) });
}

/* DELETE /api/v1/links/{slug} — burn it. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/links/${encodeURIComponent(slug.toLowerCase())}`);
  if (upstream) return upstream;
  const store = apiStore();
  const key = slug.toLowerCase();
  if (!store.links.has(key)) {
    return NextResponse.json({ error: "no such link" }, { status: 404 });
  }
  store.links.delete(key);
  return NextResponse.json({ deleted: true, slug: key });
}
