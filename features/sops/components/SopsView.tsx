"use client";

import { useState } from "react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { useIsMobile } from "@shared/lib/useIsMobile";
import { SOPS } from "@features/sops/lib/sops";
import { SopLibrary } from "./SopLibrary";
import { SopArticle } from "./SopArticle";

export function SopsView() {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState<string>(SOPS[0].id);
  // On phone, no SOP is "open" until tapped — start on the list.
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = SOPS.find((s) => s.id === selectedId) ?? SOPS[0];
  const opened = SOPS.find((s) => s.id === openId) ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Standard Operating Procedures"
        title="SOPs"
        subtitle="Repeatable steps for the work the shop does most often."
      />

      <div className="px-4 py-6 md:px-8">
        {isMobile ? (
          opened ? (
            <SopArticle sop={opened} onBack={() => setOpenId(null)} />
          ) : (
            <SopLibrary sops={SOPS} selectedId="" onSelect={setOpenId} drilldown />
          )
        ) : (
          <div className="grid grid-cols-[260px_1fr] items-start gap-6">
            <SopLibrary sops={SOPS} selectedId={selectedId} onSelect={setSelectedId} />
            <SopArticle sop={selected} />
          </div>
        )}
      </div>
    </>
  );
}
