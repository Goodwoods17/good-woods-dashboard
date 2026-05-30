"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { ContactForm } from "@features/contacts/components/ContactForm";
import { useContact, useContacts } from "@features/contacts/lib/contactsStore";

export default function EditContactPage({ params }: { params: { id: string } }) {
  const { loading } = useContacts();
  const contact = useContact(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Edit contact" />
        <div className="px-4 py-6 md:px-8 max-w-2xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!contact) {
    notFound();
  }

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title={`Edit ${contact.name}`}
        subtitle="Changes save when you submit."
      />
      <ContactForm mode="edit" contact={contact} />
    </>
  );
}
