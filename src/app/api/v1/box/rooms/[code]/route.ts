import { NextResponse } from "next/server";
import { apiStore, pruneRooms, publicRoom } from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

/* GET /api/v1/box/rooms/{code} — inspect a line. */
export async function GET(req: Request, { params }: Ctx) {
  const { code } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/box/rooms/${encodeURIComponent(code.toUpperCase())}`);
  if (upstream) return upstream;
  pruneRooms();
  const room = apiStore().rooms.get(code.toUpperCase());
  if (!room) {
    return NextResponse.json({ error: "no such room" }, { status: 404 });
  }
  return NextResponse.json({ room: publicRoom(room) });
}

/* DELETE /api/v1/box/rooms/{code} — close the line early. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { code } = await params;
  const upstream = await proxyToBackend(req, `/api/v1/box/rooms/${encodeURIComponent(code.toUpperCase())}`);
  if (upstream) return upstream;
  const key = code.toUpperCase();
  const store = apiStore();
  if (!store.rooms.has(key)) {
    return NextResponse.json({ error: "no such room" }, { status: 404 });
  }
  store.rooms.delete(key);
  return NextResponse.json({ deleted: true, code: key });
}
