// SPDX-License-Identifier: MPL-2.0
import type { Metadata } from "next";
import { KozaFooter, KozaNav } from "@/components/koza/Sections";

export const metadata: Metadata = {
  title: "Policy · koza.click",
  description: "Data & privacy policy for koza.click and box.koza.click.",
};

export default function PolicyPage() {
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
              1. Short links (koza.click)
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              When you shorten a URL, we store the destination URL, the short slug, creation timestamp, total click counter, and an optional salted password hash (<code className="kz-mono text-[12px] text-[var(--kz-mist)]">scrypt</code>). We do not log visitor IP addresses, browser fingerprints, or referrer histories on redirects.
            </p>
          </div>

          <div className="p-5">
            <h2 className="text-[14px] font-medium text-[var(--kz-mist)]">
              2. File transfers (box.koza.click)
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              Files stream directly between the sender and receiver and are{" "}
              <span className="text-[var(--kz-mist)]">never written to server disk</span>. Temporary room metadata (room code, file names, file sizes, and optional password hash) exists only while the session is active and is automatically deleted as soon as the transfer finishes or expires (60 minutes max).
            </p>
          </div>

          <div className="p-5">
            <h2 className="text-[14px] font-medium text-[var(--kz-mist)]">
              3. Local browser storage
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--kz-ash)]">
              Your recent links list is stored only in your own browser&apos;s{" "}
              <code className="kz-mono text-[12px] text-[var(--kz-mist)]">localStorage</code> so you can access links you created without an account. We do not use tracking cookies or third-party analytics.
            </p>
          </div>
        </div>
      </main>
      <KozaFooter />
    </div>
  );
}
