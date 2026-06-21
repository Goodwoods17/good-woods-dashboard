import { PageHeader } from "@shared/components/layout/PageHeader";
import { SupplierForm } from "@features/partners/components/SupplierForm";

export default function NewSupplierPage() {
  return (
    <>
      <PageHeader
        eyebrow="Partners"
        title="Add supplier"
        subtitle="A vendor you buy materials, hardware, or doors from. Prices and buy links live in the Catalog."
      />
      <SupplierForm mode="create" />
    </>
  );
}
