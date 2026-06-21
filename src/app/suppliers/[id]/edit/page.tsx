"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useCatalog } from "@features/catalog/lib/catalogStore";
import { SupplierForm } from "@features/partners/components/SupplierForm";

export default function EditSupplierPage({ params }: { params: { id: string } }) {
  const { suppliers, loading } = useCatalog();
  const supplier = suppliers.find((s) => s.id === params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Partners" title="Edit supplier" />
        <div className="px-4 py-6 md:px-8 max-w-2xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!supplier) {
    notFound();
  }

  return (
    <>
      <PageHeader eyebrow="Partners" title="Edit supplier" />
      <SupplierForm mode="edit" supplier={supplier} />
    </>
  );
}
