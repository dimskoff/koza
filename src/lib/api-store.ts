/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import crypto from "node:crypto";

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
  fingerprint: string;
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

/* ── generation (32-char alphabets, zero modulo bias) ───────── */
const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function randomApiSlug(len = 6): string {
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) {
    out += SLUG_ALPHABET[bytes[i] % SLUG_ALPHABET.length];
  }
  return out;
}

export function randomApiCode(): string {
  const bytes = crypto.randomBytes(6);
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function computeRoomFingerprint(
  code: string,
  files: { name: string; size: number }[],
  createdAt: number,
): string {
  const payload = `${code}:${createdAt}:${files.map((f) => `${f.name}:${f.size}`).join("|")}`;
  const hex = crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16).toUpperCase();
  return `${hex.slice(0, 4)}·${hex.slice(4, 8)}·${hex.slice(8, 12)}·${hex.slice(12, 16)}`;
}

/* demo digest for in-memory fallback store */
export function apiHashPass(pw: string): string {
  let h = 5381;
  for (let i = 0; i < pw.length; i++) h = ((h << 5) + h + pw.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

export function slugTaken(slug: string): boolean {
  return apiStore().links.has(slug);
}

export function codeTaken(code: string): boolean {
  return apiStore().rooms.has(code);
}

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
export function publicLink(l: ApiLink, includeProtectedUrl = false) {
  const isLocked = l.passwordHash !== null;
  return {
    slug: l.slug,
    url: isLocked && !includeProtectedUrl ? null : l.url,
    short_url: `https://koza.click/${l.slug}`,
    password: isLocked,
    clicks: l.clicks,
    created_at: new Date(l.createdAt).toISOString(),
  };
}

export function publicRoom(r: ApiRoom) {
  return {
    code: r.code,
    url: `https://box.koza.click/r/${r.code}`,
    password: r.passwordHash !== null,
    fingerprint: r.fingerprint || computeRoomFingerprint(r.code, r.files, r.createdAt),
    files: r.files,
    created_at: new Date(r.createdAt).toISOString(),
    expires_at: new Date(roomExpiry(r)).toISOString(),
  };
}
