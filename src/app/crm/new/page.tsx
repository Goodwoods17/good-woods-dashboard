import { PageHeader } from "@shared/components/layout/PageHeader";
import { ContactForm } from "@features/contacts/components/ContactForm";

export default function NewContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="New client"
        subtitle="Add a designer, GC, architect, or homeowner. Mark as anchor if losing them would hurt."
      />
      <ContactForm mode="create" />
    </>
  );
}
