import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@shared/components/layout/AppShell";
import { AuthProvider } from "@/lib/authStore";
import { JobsProvider } from "@/lib/jobsStore";
import { CatalogProvider } from "@features/catalog/lib/catalogStore";
import { ShopProvider } from "@features/shop/lib/shopStore";

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
        <AuthProvider>
          <JobsProvider>
            <CatalogProvider>
              <ShopProvider>
                <AppShell>{children}</AppShell>
              </ShopProvider>
            </CatalogProvider>
          </JobsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
