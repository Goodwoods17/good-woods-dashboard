import type { Metadata } from "next";
import { Inter, Cormorant_Garamond } from "next/font/google";
import "./globals.css";
import { AppShell } from "@shared/components/layout/AppShell";
import { AuthProvider } from "@shared/lib/authStore";
import { WorkspaceSettingsProvider } from "@shared/lib/workspaceSettings";
import { JobsProvider } from "@features/jobs/lib/jobsStore";
import { ContactsProvider } from "@features/contacts/lib/contactsStore";
import { DocumentsProvider } from "@features/documents/lib/documentsStore";
import { CatalogProvider } from "@features/catalog/lib/catalogStore";
import { WorkCardsProvider } from "@features/shop/lib/workCardsStore";
import { RefaceProvider } from "@features/reface/lib/refaceStore";
import { LabourProvider } from "@features/labour/lib/labourStore";
import { TradesProvider } from "@features/partners/lib/tradesStore";
import { SubtradesProvider } from "@features/partners/lib/subtradesStore";
import { JobTradesProvider } from "@features/partners/lib/jobTradesStore";
import { PartnerPeopleProvider } from "@features/partners/lib/partnerPeopleStore";

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
              <ContactsProvider>
                <DocumentsProvider>
                  <CatalogProvider>
                    <WorkCardsProvider>
                      <RefaceProvider>
                        <LabourProvider>
                          <TradesProvider>
                            <SubtradesProvider>
                              <JobTradesProvider>
                                <PartnerPeopleProvider>
                                  <AppShell>{children}</AppShell>
                                </PartnerPeopleProvider>
                              </JobTradesProvider>
                            </SubtradesProvider>
                          </TradesProvider>
                        </LabourProvider>
                      </RefaceProvider>
                    </WorkCardsProvider>
                  </CatalogProvider>
                </DocumentsProvider>
              </ContactsProvider>
            </JobsProvider>
          </WorkspaceSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
