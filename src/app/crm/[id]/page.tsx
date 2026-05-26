"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { ContactDetail } from "@features/contacts/components/ContactDetail";
import { useContact, useContacts } from "@features/contacts/lib/contactsStore";

export default function ContactPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { loading } = useContacts();
  const contact = useContact(id);

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Contact" />
        <div className="px-8 py-6 max-w-6xl">
          <div className="bg-white rounded-xl shadow-resting h-64 animate-pulse" />
        </div>
      </>
    );
  }

  if (!contact) {
    notFound();
  }

  return <ContactDetail contact={contact} />;
}
