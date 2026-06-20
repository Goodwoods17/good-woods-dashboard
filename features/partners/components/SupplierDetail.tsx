"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, ExternalLink, MapPin, Pencil, Star } from "lucide-react";
import { cn } from "@shared/lib/utils";
import { formatCAD } from "@shared/lib/format";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import type { CatalogSupplier } from "@features/catalog/lib/catalogRowMap";
import { PeopleSection } from "./PeopleSection";

function href(url: string): string {
  return url.startsWith("http") ? url : `https://${url}`;
}

export function SupplierDetail({ supplier }: { supplier: CatalogSupplier }) {
  const { itemsWithOffers } = useCatalog();

  // Every active offer this supplier prices, with the item it belongs to.
  const offered = useMemo(() => {
    const rows: {
      itemId: string;
      itemName: string;
      unit: string;
      price: number;
      productUrl?: string;
      isPreferred: boolean;
    }[] = [];
    for (const item of itemsWithOffers) {
      for (const o of item.offers) {
        if (o.supplierId === supplier.id && o.active) {
          rows.push({
            itemId: item.id,
            itemName: item.name,
            unit: item.unit,
            price: o.unitPrice,
            productUrl: o.productUrl,
            isPreferred: o.isPreferred,
          });
        }
      }
    }
    return rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
  }, [itemsWithOffers, supplier.id]);

  return (
    <div className="px-4 py-6 md:px-8 max-w-6xl">
      <Link
        href="/partners"
        className="inline-flex items-center gap-1.5 text-xs text-text-tertiary hover:text-text-secondary transition-colors duration-fast mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
        Back to Partners
      </Link>

      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 mb-7">
        <div className="min-w-0">
          <h1 className="font-serif text-headline font-medium text-text-primary truncate">
            {supplier.name || "Untitled supplier"}
          </h1>
          <p className="text-sm text-text-secondary mt-1.5">
            {offered.length} item{offered.length === 1 ? "" : "s"} priced
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href="/catalog"
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-surface shadow-floating hover:shadow-hover px-4 min-h-[40px] text-sm font-medium text-text-secondary transition-shadow duration-fast"
          >
            Manage offers
          </Link>
          <Link
            href={`/suppliers/${supplier.id}/edit`}
            className="inline-flex items-center justify-center gap-1.5 rounded-full bg-ink-pill text-white px-5 min-h-[40px] text-sm font-medium hover:bg-accent-active transition-colors duration-fast focus:outline-none focus:ring-2 focus:ring-accent-soft"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={1.75} />
            Edit
          </Link>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hero: what we buy here. */}
        <div className="lg:col-span-2 space-y-6">
          <Section title={`What we buy here (${offered.length})`}>
            {offered.length === 0 ? (
              <p className="text-sm text-text-tertiary px-5 pb-5">
                No catalog offers from this supplier yet. Add an offer to a material in the catalog
                to see it here.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-muted">
                    <Th>Item</Th>
                    <Th align="right">Price</Th>
                    <Th>Link</Th>
                  </tr>
                </thead>
                <tbody>
                  {offered.map((o, idx) => (
                    <tr
                      key={`${o.itemId}-${idx}`}
                      className={cn(
                        "hover:bg-surface-muted/40 transition-colors duration-fast",
                        idx > 0 && "border-t border-[rgba(26,25,22,0.05)]"
                      )}
                    >
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-text-primary font-medium">
                          {o.isPreferred && (
                            <Star
                              className="h-3.5 w-3.5 text-accent fill-current shrink-0"
                              strokeWidth={1.75}
                              aria-label="Preferred"
                            />
                          )}
                          {o.itemName}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-text-primary">
                        {formatCAD(o.price)}
                        <span className="text-text-tertiary">/{o.unit}</span>
                      </td>
                      <td className="px-4 py-3">
                        {o.productUrl ? (
                          <a
                            href={href(o.productUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-text-secondary hover:text-accent transition-colors duration-fast"
                          >
                            Buy page
                            <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                          </a>
                        ) : (
                          <span className="text-text-disabled">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>
        </div>

        {/* Quiet sidebar: people, company details, notes. */}
        <aside className="space-y-6">
          <PeopleSection kind="supplier" companyId={supplier.id} />

          {(supplier.website || supplier.address || supplier.accountNumber || supplier.leadTimeNote) && (
            <Section title="Details">
              <dl className="px-5 py-4 space-y-3 text-sm">
                {supplier.website && (
                  <Fact
                    label="Website"
                    value={
                      <a
                        href={href(supplier.website)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-text-primary hover:text-accent transition-colors duration-fast"
                      >
                        {supplier.website}
                        <ExternalLink className="h-3 w-3" strokeWidth={1.75} />
                      </a>
                    }
                  />
                )}
                {supplier.address && (
                  <Fact
                    label="Address"
                    value={
                      <span className="inline-flex items-start gap-1.5 text-text-primary">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" strokeWidth={1.75} />
                        {supplier.address}
                      </span>
                    }
                  />
                )}
                {supplier.accountNumber && <Fact label="Account #" value={supplier.accountNumber} />}
                {supplier.leadTimeNote && <Fact label="Lead time" value={supplier.leadTimeNote} />}
              </dl>
            </Section>
          )}

          {supplier.notes && (
            <Section title="Notes">
              <p className="px-5 py-4 text-sm text-text-secondary whitespace-pre-wrap leading-relaxed">
                {supplier.notes}
              </p>
            </Section>
          )}
        </aside>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface rounded-2xl shadow-resting overflow-hidden">
      <div className="px-5 py-3 bg-surface-muted">
        <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-xs uppercase tracking-[0.06em] text-text-tertiary font-medium pt-0.5 shrink-0">
        {label}
      </dt>
      <dd className="text-sm text-text-primary text-right min-w-0">{value}</dd>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      className={cn(
        "px-4 py-2.5 text-label uppercase text-text-tertiary font-medium",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      {children}
    </th>
  );
}
