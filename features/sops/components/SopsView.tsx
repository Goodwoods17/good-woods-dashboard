"use client";

import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { SOPS } from "@features/sops/lib/sops";
import { SopLibrary } from "./SopLibrary";
import { SopArticle } from "./SopArticle";

export function SopsView() {
  const [selectedId, setSelectedId] = useState<string>(SOPS[0].id);
  const selected = SOPS.find((s) => s.id === selectedId) ?? SOPS[0];

  return (
    <>
      <PageHeader
        eyebrow="Standard Operating Procedures"
        title="SOPs"
        subtitle="Repeatable steps for the work the shop does most often."
      />
      <div className="px-8 py-6 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6 max-w-6xl">
        <SopLibrary sops={SOPS} selectedId={selectedId} onSelect={setSelectedId} />
        <SopArticle sop={selected} />
      </div>
    </>
  );
}
