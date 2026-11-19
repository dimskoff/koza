// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { PageArrival } from "@/components/PageGhost";
import { POLICY_MAIN_CLASS, PolicyContent } from "@/components/koza/PolicyContent";
import { KozaFooter, KozaNav } from "@/components/koza/Sections";
import { getSite } from "@/lib/site";

export function generateMetadata(): Metadata {
  const { host, boxHost } = getSite();
  return {
    title: `Policy · ${host}`,
    description: `Data & privacy policy for ${host} and ${boxHost}.`,
  };
}

export default function PolicyPage() {
  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />
      <PageArrival page="policy">
        <main className={POLICY_MAIN_CLASS}>
          <PolicyContent />
        </main>
      </PageArrival>
      <KozaFooter />
    </div>
  );
}
