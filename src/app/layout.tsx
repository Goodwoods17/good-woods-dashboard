import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { JobsProvider } from "@/lib/jobsStore";

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
          <AppShell>{children}</AppShell>
        </JobsProvider>
      </body>
    </html>
  );
}
