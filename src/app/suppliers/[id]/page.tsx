"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { SupplierDetail } from "@features/partners/components/SupplierDetail";

export default function SupplierPage({ params }: { params: { id: string } }) {
  const { suppliers, loading } = useCatalog();
  const supplier = suppliers.find((s) => s.id === params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Partners" title="Supplier" />
        <div className="px-4 py-6 md:px-8 max-w-6xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!supplier) {
    notFound();
  }

  return <SupplierDetail supplier={supplier} />;
}
