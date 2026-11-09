/* koza api · v1 — tiny in-memory demo store (server-side only).
   Lives for the lifetime of the server process, resets on restart.
   The docs page at /docs describes every endpoint below. */

export interface ApiLink {
  slug: string;
  url: string;
  passwordHash: string | null;
  clicks: number;
  createdAt: number;
}

export interface ApiRoom {
  code: string;
  senderToken: string;
  passwordHash: string | null;
  files: { name: string; size: number }[];
  createdAt: number;
}

type ApiStore = { links: Map<string, ApiLink>; rooms: Map<string, ApiRoom> };

declare global {
  var __kozaApiStore: ApiStore | undefined;
}

export function apiStore(): ApiStore {
  if (!globalThis.__kozaApiStore) {
    globalThis.__kozaApiStore = { links: new Map(), rooms: new Map() };
  }
  return globalThis.__kozaApiStore;
}

/* ── generation ─────────────────────────────────────────────── */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789"; // no lookalikes
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function randomApiSlug(len = 6): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return out;
}

export function randomApiCode(): string {
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/* same tiny digest the box client uses — demo only */
export function apiHashPass(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/* ── validation ─────────────────────────────────────────────── */
const SLUG_RE = /^[a-z0-9_-]{3,32}$/;

export function slugTaken(slug: string): boolean {
  return apiStore().links.has(slug);
}

export function codeTaken(code: string): boolean {
  return apiStore().rooms.has(code);
}

/* ── expiry: rooms die after an hour, like the local demo offers ── */
const ROOM_TTL_MS = 60 * 60 * 1000;

export function pruneRooms(): void {
  const store = apiStore();
  const now = Date.now();
  for (const [code, room] of store.rooms) {
    if (now - room.createdAt > ROOM_TTL_MS) store.rooms.delete(code);
  }
}

export function roomExpiry(room: ApiRoom): number {
  return room.createdAt + ROOM_TTL_MS;
}

/* ── public shapes returned over the wire ───────────────────── */
export function publicLink(l: ApiLink) {
  return {
    slug: l.slug,
    url: l.url,
    short_url: `https://koza.click/${l.slug}`,
    password: l.passwordHash !== null,
    clicks: l.clicks,
    created_at: new Date(l.createdAt).toISOString(),
  };
}

export function publicRoom(r: ApiRoom) {
  return {
    code: r.code,
    url: `https://box.koza.click/r/${r.code}`,
    password: r.passwordHash !== null,
    /* demo build: the digest ships so the receiver page can gate locally */
    password_hash: r.passwordHash,
    files: r.files,
    created_at: new Date(r.createdAt).toISOString(),
    expires_at: new Date(roomExpiry(r)).toISOString(),
  };
}
