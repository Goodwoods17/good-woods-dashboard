"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useSubtrade, useSubtrades } from "@features/partners/lib/subtradesStore";
import { SubtradeDetail } from "@features/partners/components/SubtradeDetail";

export default function SubtradePage({ params }: { params: { id: string } }) {
  const { loading } = useSubtrades();
  const subtrade = useSubtrade(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Partners" title="Subtrade" />
        <div className="px-4 py-6 md:px-8 max-w-6xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!subtrade) {
    notFound();
  }

  return <SubtradeDetail subtrade={subtrade} />;
}
