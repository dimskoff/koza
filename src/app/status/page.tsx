import type { Metadata } from "next";
import { StatusDashboard } from "@/components/koza/StatusDashboard";
import { KozaFooter, KozaNav } from "@/components/koza/Sections";
import { Toaster } from "sonner";

export const metadata: Metadata = {
  title: "koza status — Instance telemetry & control",
  description: "Live telemetry, link analytics, and active WebRTC lines for this koza node.",
};

export default function StatusPage() {
  return (
    <div className="kz-root flex min-h-dvh flex-col">
      <Toaster
        position="bottom-right"
        gap={8}
        toastOptions={{
          style: {
            background: "rgba(17,18,20,0.92)",
            border: "1px solid rgba(255,255,255,0.1)",
            color: "#e6e6e6",
            borderRadius: "12px",
            fontFamily: "var(--font-geist-mono), monospace",
            fontSize: "13px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          },
        }}
      />
      <KozaNav />
      <main className="flex flex-1 flex-col items-center px-4 py-8">
        <StatusDashboard />
      </main>
      <KozaFooter />
    </div>
  );
}
