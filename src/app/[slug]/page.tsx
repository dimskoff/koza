// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LinkGate } from "@/components/koza/LinkGate";
import { API_URL } from "@/lib/backend";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { host } = getSite();
  return {
    title: `${slug} · ${host}`,
    description: `${host} short link — no account, no tracking.`,
    robots: { index: false, follow: false },
  };
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params;
  const cleanSlug = slug.trim().toLowerCase();
  const path = `${API_URL}/api/v1/links/${encodeURIComponent(cleanSlug)}`;

  let targetUrl: string | null = null;
  let initialState: "locked" | "missing" | undefined;

  try {
    const res = await fetch(path, { cache: "no-store", signal: AbortSignal.timeout(3500) });
    if (res.ok) {
      const data = (await res.json()) as { link?: { url?: string | null; password?: boolean } };
      if (data.link?.password) initialState = "locked";
      else if (data.link?.url) targetUrl = data.link.url;
      else initialState = "missing";
    } else if (res.status === 404) {
      initialState = "missing";
    }
  } catch {
    /* api momentarily busy — LinkGate probes again from the client */
  }

  if (targetUrl) {
    /* count the click on behalf of the visitor, keeping their IP for rate limiting */
    const h = await headers();
    const xff = h.get("x-forwarded-for");
    void fetch(`${path}/hit`, {
      method: "POST",
      cache: "no-store",
      headers: xff ? { "x-forwarded-for": xff } : undefined,
    }).catch(() => {});
    redirect(targetUrl);
  }

  return <LinkGate slug={slug} initialState={initialState} />;
}
