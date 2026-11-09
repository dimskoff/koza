// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LinkGate } from "@/components/koza/LinkGate";

export const dynamic = "force-dynamic";

const API_BASE =
  process.env.KOZA_API_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8787";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return {
    title: `${slug} · koza.click`,
    description: "koza.click short link — no account, no tracking.",
  };
}

export default async function SlugPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const cleanSlug = slug.trim().toLowerCase();

  let targetUrl: string | null = null;
  let initialState: "locked" | "missing" | undefined;

  try {
    const res = await fetch(
      `${API_BASE}/api/v1/links/${encodeURIComponent(cleanSlug)}`,
      {
        cache: "no-store",
        signal: AbortSignal.timeout(3500),
      },
    );
    if (res.ok) {
      const data = (await res.json()) as {
        link?: { url?: string | null; password?: boolean };
      };
      if (data?.link) {
        if (data.link.password) {
          initialState = "locked";
        } else if (data.link.url) {
          targetUrl = data.link.url;
        }
      } else {
        initialState = "missing";
      }
    } else if (res.status === 404) {
      initialState = "missing";
    }
  } catch {
    /* fallback to client probe if local API socket is momentarily busy */
  }

  if (targetUrl) {
    void fetch(
      `${API_BASE}/api/v1/links/${encodeURIComponent(cleanSlug)}/hit`,
      {
        method: "POST",
        cache: "no-store",
      },
    ).catch(() => {});
    redirect(targetUrl);
  }

  return <LinkGate slug={slug} initialState={initialState} />;
}
