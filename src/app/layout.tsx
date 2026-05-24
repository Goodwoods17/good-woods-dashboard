import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { AppShell } from "@shared/components/layout/AppShell";
import { AuthProvider } from "@shared/lib/authStore";
import { WorkspaceSettingsProvider } from "@shared/lib/workspaceSettings";
import { JobsProvider } from "@features/jobs/lib/jobsStore";
import { CatalogProvider } from "@features/catalog/lib/catalogStore";
import { ShopProvider } from "@features/shop/lib/shopStore";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["400", "500"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
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
    <html lang="en" className={`${inter.variable} ${cormorant.variable}`}>
      <body className="font-sans">
        <AuthProvider>
          <WorkspaceSettingsProvider>
            <JobsProvider>
              <CatalogProvider>
                <ShopProvider>
                  <AppShell>{children}</AppShell>
                </ShopProvider>
              </CatalogProvider>
            </JobsProvider>
          </WorkspaceSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
