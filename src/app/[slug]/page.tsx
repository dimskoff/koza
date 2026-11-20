// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { LinkGate, type LinkDecision } from "@/components/koza/LinkGate";
import { API_URL } from "@/lib/backend";
import { getSite } from "@/lib/site";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const { host } = getSite();
  return {
    title: `${slug} · ${host}`,
    description: `${host} short link — no account, no tracking.`,
    robots: { index: false, follow: false },
  };
}

/* the visitor's headers the link rules look at */
const FORWARD = ["x-forwarded-for", "user-agent", "accept-language", "referer"] as const;

export default async function SlugPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const cleanSlug = slug.trim().toLowerCase();
  const sp = await searchParams;
  const query = new URLSearchParams(
    Object.entries(sp).flatMap(([k, v]) => (Array.isArray(v) ? v.map((x) => [k, x]) : v ? [[k, v]] : [])),
  ).toString();

  const h = await headers();
  const fwd: Record<string, string> = { "content-type": "application/json" };
  for (const name of FORWARD) {
    const v = h.get(name);
    if (v) fwd[name] = v;
  }
  const referrer = h.get("referer") || "";

  let initial: LinkDecision | "missing" | undefined;
  try {
    const res = await fetch(`${API_URL}/api/v1/links/${encodeURIComponent(cleanSlug)}/resolve`, {
      method: "POST",
      headers: fwd,
      body: JSON.stringify({ query, referrer }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (res.status === 404) initial = "missing";
    else if (res.ok) initial = ((await res.json()) as { decision: LinkDecision }).decision;
  } catch {
    /* api momentarily busy — LinkGate asks again from the browser */
  }

  /* the common case: no gate at all → straight server-side redirect */
  if (initial && initial !== "missing" && initial.type === "redirect") redirect(initial.url);

  return <LinkGate slug={slug} initial={initial} query={query} referrer={referrer} />;
}
