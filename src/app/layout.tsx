import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { JobsProvider } from "@/lib/jobsStore";
import { CatalogProvider } from "@/lib/catalogStore";
import { ShopProvider } from "@/lib/shopStore";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Good Woods Dashboard",
  description: "Custom cabinetry & millwork — pipeline, pricing, and margins.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <JobsProvider>
          <CatalogProvider>
            <ShopProvider>
              <AppShell>{children}</AppShell>
            </ShopProvider>
          </CatalogProvider>
        </JobsProvider>
      </body>
    </html>
  );
}
