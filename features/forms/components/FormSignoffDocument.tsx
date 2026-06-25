"use client";

import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import type { FormInstance, FormInstanceField } from "@shared/lib/types";
import { getCompany } from "@features/jobs/lib/invoice";
import { PALETTE } from "@shared/lib/chartPalette";

/**
 * Branded signoff PDF for a completed form instance (issue #35). Renders every
 * field type — text answers, checkbox/yes-no marks, dropdowns, dates, plus
 * embedded photo + signature images — with GW branding and the completed-by /
 * signer / timestamp audit block.
 *
 * react-pdf needs image `src` URLs synchronously, so photo + signature paths are
 * pre-resolved to renderable URLs by the caller (`generateSignoffPdf`) and
 * threaded in via `resolvedImages` keyed by field id.
 */

const COLORS = {
  bg: PALETTE.background,
  surface: PALETTE.surface,
  surfaceMuted: PALETTE.surfaceMuted,
  border: PALETTE.border,
  textPrimary: PALETTE.textPrimary,
  textSecondary: PALETTE.textSecondary,
  textTertiary: PALETTE.textTertiary,
  accent: PALETTE.accent,
  accentSoft: PALETTE.accentSoft,
};

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.bg,
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10,
    color: COLORS.textPrimary,
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
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
  brandName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: COLORS.textPrimary },
  brandTagline: { fontSize: 9, color: COLORS.textTertiary, marginTop: 1 },
  docMeta: { alignItems: "flex-end" },
  docLabel: {
    fontSize: 9,
    color: COLORS.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  docTitle: {
    fontSize: 15,
    fontFamily: "Helvetica-Bold",
    color: COLORS.accent,
    maxWidth: 240,
    textAlign: "right",
  },
  banner: {
    backgroundColor: COLORS.accentSoft,
    borderRadius: 6,
    padding: 12,
    marginBottom: 20,
  },
  bannerLabel: {
    fontSize: 8,
    color: COLORS.accent,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  bannerValue: { fontSize: 11, fontFamily: "Helvetica-Bold", color: COLORS.textPrimary },
  bannerSub: { fontSize: 9, color: COLORS.textSecondary, marginTop: 2 },
  fieldsBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: "hidden",
    marginBottom: 18,
  },
  fieldRow: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  fieldRowLast: { borderBottomWidth: 0 },
  sectionRow: {
    backgroundColor: COLORS.surfaceMuted,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: COLORS.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  fieldLabel: { fontSize: 9, color: COLORS.textTertiary, marginBottom: 3 },
  fieldValue: { fontSize: 11, color: COLORS.textPrimary },
  fieldValueMuted: { fontSize: 11, color: COLORS.textTertiary, fontStyle: "italic" },
  noteText: { fontSize: 9, color: COLORS.textSecondary, marginTop: 2 },
  photo: {
    marginTop: 4,
    maxWidth: 220,
    maxHeight: 180,
    borderRadius: 4,
    objectFit: "contain",
  },
  signature: {
    marginTop: 4,
    maxWidth: 240,
    maxHeight: 90,
    objectFit: "contain",
  },
  signerMeta: { fontSize: 9, color: COLORS.textSecondary, marginTop: 3 },
  auditBlock: {
    backgroundColor: COLORS.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 8,
  },
  auditTitle: {
    fontSize: 8,
    color: COLORS.textTertiary,
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  auditRow: { flexDirection: "row", gap: 6, marginBottom: 3 },
  auditKey: { fontSize: 9, color: COLORS.textTertiary, width: 90 },
  auditValue: { fontSize: 9, color: COLORS.textPrimary, fontFamily: "Helvetica-Bold" },
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

const NO_ANSWER = "—";

function fmtDateTime(iso: string | null): string {
  if (!iso) return NO_ANSWER;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(value: string): string {
  // Date fields store an ISO `YYYY-MM-DD`. Render midday-local to dodge TZ slip.
  const d = new Date(value + "T12:00:00");
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

/** Plain-text answer for a non-media field (returns null when there's nothing to show). */
function textAnswer(field: FormInstanceField): string | null {
  switch (field.type) {
    case "checkbox":
      return field.checked ? "Yes (checked)" : "No (unchecked)";
    case "yes_no":
      if (field.value === "yes") return "Yes";
      if (field.value === "no") return "No";
      return null;
    case "date":
      return typeof field.value === "string" && field.value.trim() ? fmtDate(field.value) : null;
    case "short_text":
    case "long_text":
    case "number":
    case "dropdown":
      return typeof field.value === "string" && field.value.trim() ? field.value : null;
    default:
      return null;
  }
}

function signerName(field: FormInstanceField): string | null {
  const name = (field.config as Record<string, unknown>)?.signerName;
  return typeof name === "string" && name.trim() ? name : null;
}

function signedAt(field: FormInstanceField): string | null {
  const at = (field.config as Record<string, unknown>)?.signedAt;
  return typeof at === "string" && at.trim() ? at : null;
}

export type FormSignoffDocumentProps = {
  instance: FormInstance;
  fields: FormInstanceField[];
  /** Pre-resolved renderable image URLs, keyed by field id (photo + signature). */
  resolvedImages: Record<string, string>;
  /** Optional job context (code · name) for the banner. */
  jobContext?: { code: string; name: string } | null;
};

export function FormSignoffDocument({
  instance,
  fields,
  resolvedImages,
  jobContext,
}: FormSignoffDocumentProps) {
  const company = getCompany();
  // Pick the last completed signature field for the headline signer line, if any.
  const lastSignature = [...fields].reverse().find((f) => f.type === "signature" && signerName(f));
  const headlineSigner = lastSignature ? signerName(lastSignature) : null;
  const headlineSignedAt = lastSignature ? signedAt(lastSignature) : null;

  return (
    <Document title={`${instance.title} — Signoff`} author={company.name} subject="Form signoff">
      <Page size="LETTER" style={styles.page}>
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <Text style={styles.brandMark}>GW</Text>
            <View>
              <Text style={styles.brandName}>{company.name}</Text>
              <Text style={styles.brandTagline}>{company.tagline}</Text>
            </View>
          </View>
          <View style={styles.docMeta}>
            <Text style={styles.docLabel}>Form Signoff</Text>
            <Text style={styles.docTitle}>{instance.title}</Text>
          </View>
        </View>

        {jobContext && (
          <View style={styles.banner}>
            <Text style={styles.bannerLabel}>Project</Text>
            <Text style={styles.bannerValue}>{jobContext.name}</Text>
            <Text style={styles.bannerSub}>{jobContext.code}</Text>
          </View>
        )}

        <View style={styles.fieldsBlock}>
          {fields.map((field, idx) => {
            const last = idx === fields.length - 1;

            if (field.type === "section") {
              return (
                <View key={field.id} style={styles.sectionRow}>
                  <Text style={styles.sectionLabel}>{field.label}</Text>
                </View>
              );
            }

            const rowStyle = last ? [styles.fieldRow, styles.fieldRowLast] : styles.fieldRow;
            const img = resolvedImages[field.id];

            if (field.type === "photo") {
              return (
                <View key={field.id} style={rowStyle} wrap={false}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  {img ? (
                    <Image src={img} style={styles.photo} />
                  ) : (
                    <Text style={styles.fieldValueMuted}>{NO_ANSWER}</Text>
                  )}
                  {field.note ? <Text style={styles.noteText}>{field.note}</Text> : null}
                </View>
              );
            }

            if (field.type === "signature") {
              const name = signerName(field);
              const at = signedAt(field);
              return (
                <View key={field.id} style={rowStyle} wrap={false}>
                  <Text style={styles.fieldLabel}>{field.label}</Text>
                  {img ? (
                    <Image src={img} style={styles.signature} />
                  ) : (
                    <Text style={styles.fieldValueMuted}>{NO_ANSWER}</Text>
                  )}
                  {name ? (
                    <Text style={styles.signerMeta}>
                      Signed by {name}
                      {at ? ` · ${fmtDateTime(at)}` : ""}
                    </Text>
                  ) : null}
                </View>
              );
            }

            const answer = textAnswer(field);
            return (
              <View key={field.id} style={rowStyle}>
                <Text style={styles.fieldLabel}>{field.label}</Text>
                <Text style={answer ? styles.fieldValue : styles.fieldValueMuted}>
                  {answer ?? NO_ANSWER}
                </Text>
                {field.note ? <Text style={styles.noteText}>{field.note}</Text> : null}
              </View>
            );
          })}
        </View>

        <View style={styles.auditBlock}>
          <Text style={styles.auditTitle}>Completion</Text>
          <View style={styles.auditRow}>
            <Text style={styles.auditKey}>Completed by</Text>
            <Text style={styles.auditValue}>{instance.completedBy || NO_ANSWER}</Text>
          </View>
          <View style={styles.auditRow}>
            <Text style={styles.auditKey}>Completed at</Text>
            <Text style={styles.auditValue}>{fmtDateTime(instance.completedAt)}</Text>
          </View>
          {headlineSigner && (
            <View style={styles.auditRow}>
              <Text style={styles.auditKey}>Signed by</Text>
              <Text style={styles.auditValue}>
                {headlineSigner}
                {headlineSignedAt ? ` · ${fmtDateTime(headlineSignedAt)}` : ""}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          <Text style={styles.footerNote}>
            {company.name} · Generated {fmtDateTime(new Date().toISOString())}
          </Text>
          <Text style={styles.footerNote}>{instance.title}</Text>
        </View>
      </Page>
    </Document>
  );
}
