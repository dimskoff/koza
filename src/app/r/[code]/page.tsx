// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { Receiver } from "@/components/box/Receiver";
import { getSite } from "@/lib/site";

export function generateMetadata(): Metadata {
  return {
    title: `incoming line · ${getSite().boxHost}`,
    description: "A direct line is opening — files travel straight to you.",
  };
}

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <Receiver code={code.toUpperCase()} />;
}
