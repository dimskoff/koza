// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { KozaToaster } from "@/components/KozaToaster";
import { PageArrival, STATUS_MAIN_CLASS } from "@/components/PageGhost";
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
      <PageArrival page="status">
        <main className={STATUS_MAIN_CLASS}>
          <StatusDashboard />
        </main>
      </PageArrival>
      <KozaFooter />
    </div>
  );
}
