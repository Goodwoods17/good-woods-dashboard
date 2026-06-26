import { notFound } from "next/navigation";
import { InvoiceDetailView } from "@features/invoices/components/InvoiceDetailView";
import { invoicesEnabled } from "@features/invoices/lib/featureFlag";

export default function InvoiceDetailPage({ params }: { params: { id: string } }) {
  if (!invoicesEnabled()) notFound();
  return <InvoiceDetailView id={params.id} />;
}
