import type { Metadata } from "next";
import { Source_Sans_3, Syne } from "next/font/google";
import { CartProvider } from "@/lib/cart";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { BRAND } from "@/lib/products";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  weight: ["600", "700", "800"],
});

const sourceSans = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-source-sans",
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: {
    default: `${BRAND.name} — Home, style, pets, and play`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    "Northlane is a multi-niche US store for bed, bath, kitchens, home decor, jewelry, women's fashion, pet accessories, and video games. Ships in 8–14 business days.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en-US">
      <body className={`${syne.variable} ${sourceSans.variable}`}>
        <CartProvider>
          <div className="site-shell">
            <Header />
            <main className="site-main">{children}</main>
            <Footer />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}