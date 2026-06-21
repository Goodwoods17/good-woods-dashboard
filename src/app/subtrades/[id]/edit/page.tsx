"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useSubtrade, useSubtrades } from "@features/partners/lib/subtradesStore";
import { SubtradeForm } from "@features/partners/components/SubtradeForm";

export default function EditSubtradePage({ params }: { params: { id: string } }) {
  const { loading } = useSubtrades();
  const subtrade = useSubtrade(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Partners" title="Edit subtrade" />
        <div className="px-4 py-6 md:px-8 max-w-2xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!subtrade) {
    notFound();
  }

  return (
    <>
      <PageHeader eyebrow="Partners" title="Edit subtrade" />
      <SubtradeForm mode="edit" subtrade={subtrade} />
    </>
  );
}
