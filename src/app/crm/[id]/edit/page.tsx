"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { ContactForm } from "@features/contacts/components/ContactForm";
import { useContact, useContacts } from "@features/contacts/lib/contactsStore";

export default function EditContactPage({
  params,
}: {
  params: { id: string };
}) {
  const { loading } = useContacts();
  const contact = useContact(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Edit contact" />
        <div className="px-8 py-6 max-w-2xl">
          <div className="bg-white rounded-xl shadow-resting h-64 animate-pulse" />
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
