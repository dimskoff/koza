import type { Metadata } from "next";
import { WipeLayer } from "@/components/wipe";
import "./globals.css";

export const metadata: Metadata = {
  title: "koza.click",
  description: "Short links, zero strings.",
  icons: {
    icon:
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#050506"/><path d="M16 4.6 L26.6 10.3 L16 16 L5.4 10.3 Z" fill="#FF6363"/><path d="M5.4 10.3 L16 16 L16 27.4 L5.4 21.7 Z" fill="#D94848"/><path d="M26.6 10.3 L16 16 L16 27.4 L26.6 21.7 Z" fill="#A33333"/></svg>',
      ),
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        {children}
        <WipeLayer />
      </body>
    </html>
  );
}
