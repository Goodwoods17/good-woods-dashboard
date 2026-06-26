import { notFound } from "next/navigation";
import { InvoicesView } from "@features/invoices/components/InvoicesView";
import { invoicesEnabled } from "@features/invoices/lib/featureFlag";

export default function InvoicesPage() {
  if (!invoicesEnabled()) notFound();
  return <InvoicesView />;
}
