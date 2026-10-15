import type { Metadata } from "next";
import { Figtree, Fraunces, IBM_Plex_Mono } from "next/font/google";

import { TenantProvider } from "@/lib/tenant-context";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

const sans = Figtree({
  variable: "--font-sans",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Allyanna Accounting",
  description:
    "Sint Maarten compliance workspace — multi-tenant AI accounting shell for Allyanna.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${display.variable} ${sans.variable} ${mono.variable}`}>
        <TenantProvider>{children}</TenantProvider>
      </body>
    </html>
  );
}
