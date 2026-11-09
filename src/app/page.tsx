// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { headers } from "next/headers";
import { KozaSite } from "@/components/koza/KozaSite";
import { BoxSite } from "@/components/box/BoxSite";

export async function generateMetadata(): Promise<Metadata> {
  const headerList = await headers();
  const host = (headerList.get("x-forwarded-host") || headerList.get("host") || "").toLowerCase();

  if (host.startsWith("box.")) {
    return {
      title: "box.koza.click — Files that travel straight",
      description:
        "Peer-to-peer file transfer: drop files, share a code or link, and bytes move directly between devices. Encrypted end to end, never stored.",
      openGraph: {
        title: "box.koza.click — Files that travel straight",
        description: "Direct peer-to-peer file transfer with end-to-end encryption.",
        siteName: "box.koza.click",
        type: "website",
      },
    };
  }

  return {
    title: "koza.click — Short links, zero strings",
    description:
      "Paste a URL and get a tidy koza.click link. Custom names, passwords and QR codes — no account, no clutter.",
    openGraph: {
      title: "koza.click — Short links, zero strings",
      description: "Anonymous URL shortening with custom names, passwords and QR codes.",
      siteName: "koza.click",
      type: "website",
    },
  };
}

export default async function Home() {
  const headerList = await headers();
  const host = (headerList.get("x-forwarded-host") || headerList.get("host") || "").toLowerCase();

  if (host.startsWith("box.")) {
    return <BoxSite />;
  }
  return <KozaSite />;
}
