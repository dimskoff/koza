import type { Metadata } from "next";
import { Receiver } from "@/components/box/Receiver";

export const metadata: Metadata = {
  title: "incoming line · box.koza.click",
  description: "A direct peer-to-peer line is opening — files travel straight to you.",
};

export default async function RoomPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <Receiver code={code.toUpperCase()} />;
}
