"use client";

import { useState } from "react";
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { elementsToCSV, elementsToText } from "../lib/exporters";
import { generateWoodDoorsForms, type OrderCustomer } from "../lib/orderForm";
import type { RefaceProject } from "../lib/types";

function download(filename: string, content: BlobPart, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const slug = (name: string) =>
  name
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "project";

const btnCls =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary hover:border-border-strong transition-colors duration-fast disabled:opacity-40";

/** CSV / text export + the New Surrey Wood Doors order form (.xlsx). */
export function ExportMenu({
  project,
  customer,
}: {
  project: RefaceProject;
  customer: OrderCustomer;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleOrderForm() {
    setBusy(true);
    setError(null);
    try {
      const forms = await generateWoodDoorsForms(project, customer);
      forms.forEach((f) =>
        download(
          f.filename,
          new Blob([f.buffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          }),
          ""
        )
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-surface shadow-resting p-4 space-y-3">
      <h3 className="font-serif text-title text-text-primary">Export</h3>
      <div className="flex flex-wrap gap-2">
        <button onClick={handleOrderForm} disabled={busy} className={btnCls}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
          )}
          Wood Doors order form
        </button>
        <button
          onClick={() => download(`${slug(project.name)}.csv`, elementsToCSV(project), "text/csv")}
          className={btnCls}
        >
          <Download className="h-4 w-4" strokeWidth={1.75} />
          CSV
        </button>
        <button
          onClick={() =>
            download(`${slug(project.name)}.txt`, elementsToText(project), "text/plain")
          }
          className={btnCls}
        >
          <FileText className="h-4 w-4" strokeWidth={1.75} />
          Text
        </button>
      </div>
      {error && <p className="text-caption text-status-blocked">{error}</p>}
    </div>
  );
}
