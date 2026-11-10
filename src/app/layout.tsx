// SPDX-License-Identifier: MPL-2.0
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#050506",
  colorScheme: "dark",
};

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
    <html
      lang="en"
      className="dark bg-[#050506]"
      style={{ backgroundColor: "#050506", colorScheme: "dark" }}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://box.koza.click" />
        <link rel="preconnect" href="https://koza.click" />
        <link rel="dns-prefetch" href="https://box.koza.click" />
        <link rel="dns-prefetch" href="https://koza.click" />
      </head>
      <body
        className="bg-[#050506] text-[#e6e6e6] antialiased"
        style={{ backgroundColor: "#050506", colorScheme: "dark" }}
      >
        {children}
      </body>
    </html>
  );
}
