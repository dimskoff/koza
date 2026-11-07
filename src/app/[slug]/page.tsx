import type { Metadata } from "next";
import { LinkGate } from "@/components/koza/LinkGate";

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
  return <LinkGate slug={slug} />;
}
