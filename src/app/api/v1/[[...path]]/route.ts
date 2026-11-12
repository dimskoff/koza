// SPDX-License-Identifier: MPL-2.0
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

async function handle(req: Request, { params }: Ctx) {
  const { path = [] } = await params;
  const tail = path.map((p) => encodeURIComponent(p)).join("/");
  const { search } = new URL(req.url);
  return proxyToBackend(req, `/api/v1${tail ? `/${tail}` : ""}${search}`);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
