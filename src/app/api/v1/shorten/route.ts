import { NextResponse } from "next/server";
import {
  apiHashPass,
  apiStore,
  publicLink,
  randomApiSlug,
  slugTaken,
} from "@/lib/api-store";
import { normalizeUrl, RESERVED_SLUGS } from "@/components/koza/lib";
import { proxyToBackend } from "@/lib/backend";

export const dynamic = "force-dynamic";

const SLUG_RE = /^[a-z0-9_-]{3,32}$/;

/* POST /api/v1/shorten — mint a short link.
   body: { url: string, slug?: string, password?: string } */
export async function POST(req: Request) {
  const upstream = await proxyToBackend(req, "/api/v1/shorten");
  if (upstream) return upstream;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "body must be json" }, { status: 400 });
  }

  const { url, slug, password } = (body ?? {}) as {
    url?: string;
    slug?: string;
    password?: string;
  };

  const normalized = url ? normalizeUrl(url) : null;
  if (!normalized) {
    return NextResponse.json(
      { error: "invalid url — try https://example.com" },
      { status: 400 },
    );
  }

  const store = apiStore();

  /* slug: hand-picked or auto */
  let finalSlug = "";
  if (slug) {
    const want = slug.trim().toLowerCase();
    if (!SLUG_RE.test(want)) {
      return NextResponse.json(
        { error: "invalid slug — 3-32 chars, lowercase a-z / 0-9 / dashes" },
        { status: 400 },
      );
    }
    if (RESERVED_SLUGS.has(want)) {
      return NextResponse.json({ error: "this name is reserved" }, { status: 409 });
    }
    if (slugTaken(want)) {
      return NextResponse.json({ error: "slug already taken" }, { status: 409 });
    }
    finalSlug = want;
  } else {
    do {
      finalSlug = randomApiSlug();
    } while (slugTaken(finalSlug));
  }

  const pw = typeof password === "string" ? password.trim() : "";
  if (pw.length > 0 && pw.length < 4) {
    return NextResponse.json(
      { error: "password too short — at least 4 characters" },
      { status: 400 },
    );
  }

  const link = {
    slug: finalSlug,
    url: normalized,
    passwordHash: pw ? apiHashPass(pw) : null,
    clicks: 0,
    createdAt: Date.now(),
  };
  store.links.set(finalSlug, link);

  return NextResponse.json({ link: publicLink(link) }, { status: 201 });
}
