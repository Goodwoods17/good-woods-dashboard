import { PageHeader } from "@shared/components/layout/PageHeader";
import { SubtradeForm } from "@features/partners/components/SubtradeForm";

export default function NewSubtradePage() {
  return (
    <>
      <PageHeader
        eyebrow="Partners"
        title="Add subtrade"
        subtitle="An install crew, finisher, or other trade you hire. Assign them to projects from each project's Trades card."
      />
      <SubtradeForm mode="create" />
    </>
  );
}
