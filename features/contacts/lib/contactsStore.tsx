"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Contact } from "@shared/lib/types";
import {
  CONTACTS_TABLE,
  getSupabase,
  hasSupabase,
} from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import { contactToRow, rowToContact, type ContactRow } from "./contactsRowMap";

const STORAGE_KEY = "gw_contacts_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; contacts: Contact[] };

export type ContactsBackend = "supabase" | "localStorage";

type ContactsContextValue = {
  contacts: Contact[];
  loading: boolean;
  backend: ContactsBackend;
  error: string | null;
  refresh: () => Promise<void>;
  touchContact: (id: string) => Promise<void>;
};

const ContactsContext = createContext<ContactsContextValue | null>(null);

function localLoad(): Contact[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.contacts)) {
      return [];
    }
    return parsed.contacts;
  } catch {
    return [];
  }
}

function localSave(contacts: Contact[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, contacts };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent fail, matches jobsStore */
  }
}

async function supabaseLoad(): Promise<Contact[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(CONTACTS_TABLE)
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as ContactRow[] | null)?.map(rowToContact) ?? [];
}

export function ContactsProvider({ children }: { children: ReactNode }) {
  const backend: ContactsBackend = hasSupabase() ? "supabase" : "localStorage";
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const contactsRef = useRef<Contact[]>([]);

  useEffect(() => {
    contactsRef.current = contacts;
  }, [contacts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setContacts(remote);
        } else {
          if (!cancelled) setContacts(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setContacts(localLoad());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  useEffect(() => {
    if (!loading && backend === "localStorage") localSave(contacts);
  }, [contacts, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setContacts(remote);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const touchContact = useCallback(
    async (id: string) => {
      const now = new Date().toISOString();
      const previous = contactsRef.current;
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, lastTouchedAt: now } : c))
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = contactsRef.current.find((c) => c.id === id);
        if (!target) return;
        const { error: upErr } = await sb
          .from(CONTACTS_TABLE)
          .update({ last_touched_at: now })
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
        // The DB trigger already bumps last_touched_at on job UPDATE; this
        // call is for off-job touches (the coffee-with-Raubyn case). The
        // contactToRow round-trip is intentional only on full writes.
        void contactToRow(target);
      } catch (e) {
        setError(formatError(e));
        setContacts(previous);
      }
    },
    [backend]
  );

  return (
    <ContactsContext.Provider
      value={{ contacts, loading, backend, error, refresh, touchContact }}
    >
      {children}
    </ContactsContext.Provider>
  );
}

export function useContacts(): ContactsContextValue {
  const ctx = useContext(ContactsContext);
  if (!ctx) {
    throw new Error("useContacts must be used inside <ContactsProvider>");
  }
  return ctx;
}

export function useContact(id: string): Contact | undefined {
  const { contacts } = useContacts();
  return contacts.find((c) => c.id === id);
}
