// SPDX-License-Identifier: MPL-2.0
import { KozaToaster } from "@/components/KozaToaster";
import type { Metadata } from "next";
import { StatusDashboard } from "@/components/koza/StatusDashboard";
import { KozaFooter, KozaNav } from "@/components/koza/Sections";
import { getSite } from "@/lib/site";

export function generateMetadata(): Metadata {
  const { host, boxHost } = getSite();
  return {
    title: `Status · ${host}`,
    description: `Live service status for ${host} and ${boxHost}.`,
  };
}

export default function StatusPage() {
  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaToaster />
      <KozaNav />
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-8">
        <StatusDashboard />
      </main>
      <KozaFooter />
    </div>
  );
}
