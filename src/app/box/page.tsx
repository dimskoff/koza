import type { Metadata } from "next";
import { BoxSite } from "@/components/box/BoxSite";

export const metadata: Metadata = {
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

export default function BoxPage() {
  return <BoxSite />;
}
