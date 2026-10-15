import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Allyanna — SXM compliance desk",
  description:
    "Review OCR intakes, post invoices, and act on turnover-tax dues for Sint Maarten.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
