import type { Metadata } from "next";
import { KozaSite } from "@/components/koza/KozaSite";

export const metadata: Metadata = {
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

export default function Home() {
  return <KozaSite />;
}
