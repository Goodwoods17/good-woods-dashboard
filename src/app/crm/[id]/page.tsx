"use client";

import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { ContactDetail } from "@features/contacts/components/ContactDetail";
import { useContact, useContacts } from "@features/contacts/lib/contactsStore";

export default function ContactPage({ params }: { params: { id: string } }) {
  const { loading } = useContacts();
  const contact = useContact(params.id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Contact" />
        <div className="px-4 py-6 md:px-8 max-w-6xl">
          <div className="bg-surface rounded-2xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!contact) {
    notFound();
  }

  return <ContactDetail contact={contact} />;
}
