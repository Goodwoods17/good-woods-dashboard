"use client";

import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from "@react-pdf/renderer";
import type { Job } from "@/lib/types";
import { COMPANY, computeInvoiceTotals, TAX_RATE } from "@/lib/invoice";

const COLORS = {
  bg: "#FAF9F7",
  surface: "#FFFFFF",
  border: "#E8E4DD",
  borderStrong: "#D6D1C7",
  textPrimary: "#2B2926",
  textSecondary: "#6B6862",
  textTertiary: "#9A968D",
  accent: "#B86F52",
  accentSoft: "#F1E4DC",
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    fontSize: 10,
    color: COLORS.textPrimary,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 32,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  brandMark: {
    width: 28,
    height: 28,
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 7,
  },
  brandName: {
    fontSize: 14,
    fontFamily: "Helvetica-Bold",
    color: COLORS.textPrimary,
  },
  brandTagline: {
    fontSize: 9,
    color: COLORS.textTertiary,
    marginTop: 1,
  },
  invoiceMetaBlock: {
    alignItems: "flex-end",
  },
  invoiceLabel: {
    fontSize: 9,
    color: COLORS.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  invoiceNumber: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 2,
  },
  metaKey: {
    fontSize: 9,
    color: COLORS.textTertiary,
    width: 70,
    textAlign: "right",
  },
  metaValue: {
    fontSize: 9,
    color: COLORS.textPrimary,
    fontFamily: "Helvetica-Bold",
  },
  partiesGrid: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 28,
  },
  partyBlock: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  partyLabel: {
    fontSize: 8,
    color: COLORS.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  partyName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLORS.textPrimary,
    marginBottom: 3,
  },
  partyDetail: {
    fontSize: 9,
    color: COLORS.textSecondary,
    lineHeight: 1.4,
  },
  jobBanner: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: 6,
    padding: 12,
    marginBottom: 22,
  },
  jobBannerLabel: {
    fontSize: 8,
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  jobBannerName: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: COLORS.textPrimary,
  },
  jobBannerCode: {
    fontSize: 9,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  table: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: 16,
  },
  tableHead: {
    flexDirection: "row",
    backgroundColor: "#F4F2EE",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  th: {
    fontSize: 8,
    color: COLORS.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.0,
    fontFamily: "Helvetica-Bold",
  },
  thDescription: { flex: 1 },
  thQty: { width: 40, textAlign: "right" },
  thUnit: { width: 70, textAlign: "right" },
  thLine: { width: 80, textAlign: "right" },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  tableRowLast: { borderBottomWidth: 0 },
  td: { fontSize: 10, color: COLORS.textPrimary },
  tdDescription: { flex: 1 },
  tdQty: { width: 40, textAlign: "right" },
  tdUnit: { width: 70, textAlign: "right" },
  tdLine: { width: 80, textAlign: "right", fontFamily: "Helvetica-Bold" },
  totalsBlock: {
    width: 240,
    marginLeft: "auto",
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  totalsLabel: {
    fontSize: 10,
    color: COLORS.textSecondary,
  },
  totalsValue: {
    fontSize: 10,
    color: COLORS.textPrimary,
    fontFamily: "Helvetica-Bold",
  },
  totalsDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 6,
  },
  grandLabel: {
    fontSize: 10,
    color: COLORS.textPrimary,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  grandValue: {
    fontSize: 14,
    color: COLORS.accent,
    fontFamily: "Helvetica-Bold",
  },
  footer: {
    position: "absolute",
    bottom: 36,
    left: 56,
    right: 56,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerNote: { fontSize: 8, color: COLORS.textTertiary },
});

function fmt(n: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 2,
  }).format(n);
}

function fmtDate(iso: string): string {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function InvoiceDocument({ job }: { job: Job }) {
  const totals = computeInvoiceTotals(job);
  const taxPct = (TAX_RATE * 100).toFixed(0);

  return (
    <Document
      title={`${job.invoice.number} — ${job.client}`}
      author={COMPANY.name}
      subject={`Invoice for ${job.name}`}
    >
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View>
            <View style={styles.brandRow}>
              <Text style={styles.brandMark}>GW</Text>
              <View>
                <Text style={styles.brandName}>{COMPANY.name}</Text>
                <Text style={styles.brandTagline}>{COMPANY.tagline}</Text>
              </View>
            </View>
          </View>
          <View style={styles.invoiceMetaBlock}>
            <Text style={styles.invoiceLabel}>Invoice</Text>
            <Text style={styles.invoiceNumber}>{job.invoice.number}</Text>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Issued</Text>
              <Text style={styles.metaValue}>{fmtDate(job.invoice.issuedDate)}</Text>
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.metaKey}>Due</Text>
              <Text style={styles.metaValue}>{fmtDate(job.invoice.dueDate)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.partiesGrid}>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>From</Text>
            <Text style={styles.partyName}>{COMPANY.name}</Text>
            <Text style={styles.partyDetail}>{COMPANY.address}</Text>
            <Text style={styles.partyDetail}>{COMPANY.email}</Text>
            <Text style={styles.partyDetail}>{COMPANY.gstNumber}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.partyLabel}>Bill to</Text>
            <Text style={styles.partyName}>{job.client}</Text>
            <Text style={styles.partyDetail}>{job.address}</Text>
          </View>
        </View>

        <View style={styles.jobBanner}>
          <Text style={styles.jobBannerLabel}>Project</Text>
          <Text style={styles.jobBannerName}>{job.name}</Text>
          <Text style={styles.jobBannerCode}>
            {job.code} · Install {fmtDate(job.installDate)}
          </Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.thDescription]}>Description</Text>
            <Text style={[styles.th, styles.thQty]}>Qty</Text>
            <Text style={[styles.th, styles.thUnit]}>Unit</Text>
            <Text style={[styles.th, styles.thLine]}>Amount</Text>
          </View>
          {job.invoice.lineItems.map((li, idx) => {
            const last = idx === job.invoice.lineItems.length - 1;
            return (
              <View
                key={idx}
                style={last ? [styles.tableRow, styles.tableRowLast] : styles.tableRow}
              >
                <Text style={[styles.td, styles.tdDescription]}>{li.description}</Text>
                <Text style={[styles.td, styles.tdQty]}>{li.qty}</Text>
                <Text style={[styles.td, styles.tdUnit]}>{fmt(li.unitPrice)}</Text>
                <Text style={[styles.td, styles.tdLine]}>{fmt(li.qty * li.unitPrice)}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.totalsBlock}>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>Subtotal</Text>
            <Text style={styles.totalsValue}>{fmt(totals.subtotal)}</Text>
          </View>
          <View style={styles.totalsRow}>
            <Text style={styles.totalsLabel}>GST + PST ({taxPct}%)</Text>
            <Text style={styles.totalsValue}>{fmt(totals.tax)}</Text>
          </View>
          <View style={styles.totalsDivider} />
          <View style={styles.totalsRow}>
            <Text style={styles.grandLabel}>Total CAD</Text>
            <Text style={styles.grandValue}>{fmt(totals.total)}</Text>
          </View>
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            Thank you for your business. Payment due {fmtDate(job.invoice.dueDate)}.
          </Text>
          <Text style={styles.footerNote}>{COMPANY.name} · {COMPANY.gstNumber}</Text>
        </View>
      </Page>
    </Document>
  );
}
