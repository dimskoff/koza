// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { KozaFooter, KozaNav } from "@/components/koza/Sections";
import { getSite } from "@/lib/site";

export function generateMetadata(): Metadata {
  const { host, boxHost } = getSite();
  return {
    title: `Policy · ${host}`,
    description: `Data & privacy policy for ${host} and ${boxHost}.`,
  };
}

const code = "kz-mono text-[12px] text-[var(--kz-mist)]";

export default function PolicyPage() {
  const { host, boxHost } = getSite();
  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <KozaNav />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-10">
        <h1 className="text-2xl font-medium tracking-[-0.02em] text-[var(--kz-mist)] sm:text-3xl">
          Data{" "}
          <span className="bg-gradient-to-r from-[var(--kz-coral)] to-[#ffb0a6] bg-clip-text text-transparent">
            policy
          </span>
          .
        </h1>
        <p className="kz-mono mt-1.5 text-[12px] text-[var(--kz-smoke)]">
          what is stored, what isn&apos;t, and how your data is handled
        </p>

        <div className="kz-edge mt-6 divide-y divide-[var(--kz-hairline)] overflow-hidden">
          <div className="p-5">
            <h2 className="text-[14px] font-medium text-[var(--kz-mist)]">
              1. Short links ({host})
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              When you shorten a URL, we store the destination URL, the short slug, the creation
              time, a click counter and, optionally, a salted <code className={code}>scrypt</code>{" "}
              password hash. Links are not listed publicly. We do not keep access logs with visitor
              IP addresses; IPs are held in memory for a minute at most, for rate limiting only.
            </p>
          </div>

          <div className="p-5">
            <h2 className="text-[14px] font-medium text-[var(--kz-mist)]">
              2. File transfers ({boxHost})
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              Whenever possible files travel <span className="text-[var(--kz-mist)]">directly
              between browsers</span> over WebRTC (DTLS-encrypted). If a direct connection cannot be
              established, data is relayed through this server over TLS: it passes through server
              memory in transit and is{" "}
              <span className="text-[var(--kz-mist)]">never written to disk</span>. Room metadata
              (code, file names and sizes, optional password hash) expires after at most 60
              minutes.
            </p>
          </div>

          <div className="p-5">
            <h2 className="text-[14px] font-medium text-[var(--kz-mist)]">
              3. Local browser storage
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              Your recent links list lives only in your browser&apos;s{" "}
              <code className={code}>localStorage</code>. No tracking cookies, no analytics. Site
              icons in that list are fetched from Google&apos;s favicon service, which sees the
              destination domain.
            </p>
          </div>
        </div>
      </main>
      <KozaFooter />
    </div>
  );
}
