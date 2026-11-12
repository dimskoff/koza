// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { KozaSite } from "@/components/koza/KozaSite";
import { BoxSite } from "@/components/box/BoxSite";
import { getSite, isBoxHost } from "@/lib/site";

async function onBoxHost(): Promise<boolean> {
  const h = await headers();
  return isBoxHost(h.get("x-forwarded-host") || h.get("host"));
}

export async function generateMetadata(): Promise<Metadata> {
  const { host, boxHost } = getSite();

  if (await onBoxHost()) {
    const title = `${boxHost} — Files that travel straight`;
    const description =
      "Drop files, share a code or link, and bytes move directly between devices — never stored.";
    return {
      title,
      description,
      openGraph: { title, description, siteName: boxHost, type: "website" },
    };
  }

  const title = `${host} — Short links, zero strings`;
  const description = `Paste a URL and get a tidy ${host} link. Custom names, passwords and QR codes — no account, no clutter.`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: host, type: "website" },
  };
}

export default async function Home() {
  return (await onBoxHost()) ? <BoxSite /> : <KozaSite />;
}
