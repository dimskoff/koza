import { NextResponse } from "next/server";
import {
  apiHashPass,
  apiStore,
  codeTaken,
  pruneRooms,
  publicRoom,
  randomApiCode,
} from "@/lib/api-store";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

const MAX_FILES = 12;

/* POST /api/v1/box/rooms — open a direct line.
   body: { password?: string, passwordHash?: string, files?: [{ name, size }] } */
export async function POST(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/box/rooms");
  if (upstream) return upstream;
  pruneRooms();

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine — an open line with no staged files */
  }

  const { password, passwordHash, files } = (body ?? {}) as {
    password?: string;
    passwordHash?: string | null;
    files?: { name?: unknown; size?: unknown }[];
  };

  /* files: optional staged payload metadata (max 12, like the box ui) */
  let staged: { name: string; size: number }[] = [];
  if (Array.isArray(files)) {
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `too many files — max ${MAX_FILES}` },
        { status: 400 },
      );
    }
    for (const f of files) {
      const name = typeof f?.name === "string" ? f.name.trim().slice(0, 255) : "";
      const size = typeof f?.size === "number" && Number.isFinite(f.size) ? Math.max(0, Math.round(f.size)) : -1;
      if (!name || size < 0) {
        return NextResponse.json(
          { error: "each file needs { name: string, size: number }" },
          { status: 400 },
        );
      }
      staged.push({ name, size });
    }
  }

  const pw = typeof password === "string" ? password.trim() : "";
  if (pw.length > 0 && pw.length < 4) {
    return NextResponse.json(
      { error: "password too short — at least 4 characters" },
      { status: 400 },
    );
  }

  const hash =
    typeof passwordHash === "string" && passwordHash.length > 0
      ? passwordHash
      : pw
        ? apiHashPass(pw)
        : null;

  const store = apiStore();
  let code = "";
  do {
    code = randomApiCode();
  } while (codeTaken(code));

  const room = {
    code,
    passwordHash: hash,
    files: staged,
    createdAt: Date.now(),
  };
  store.rooms.set(code, room);

  return NextResponse.json({ room: publicRoom(room) }, { status: 201 });
}

/* GET /api/v1/box/rooms — every live line. */
export async function GET(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/box/rooms");
  if (upstream) return upstream;
  pruneRooms();
  const rooms = [...apiStore().rooms.values()]
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(publicRoom);
  return NextResponse.json({ count: rooms.length, rooms });
}
