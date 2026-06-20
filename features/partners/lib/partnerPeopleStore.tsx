"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { PartnerCompanyKind, PartnerPerson } from "./types";
import {
  PARTNER_PEOPLE_TABLE,
  partnerPersonToRow,
  rowToPartnerPerson,
  type PartnerPersonRow,
} from "./rowMaps";

const STORAGE_KEY = "gw_partner_people_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; people: PartnerPerson[] };

export type PartnerPeopleBackend = "supabase" | "localStorage";

type PartnerPeopleContextValue = {
  people: PartnerPerson[];
  loading: boolean;
  backend: PartnerPeopleBackend;
  error: string | null;
  refresh: () => Promise<void>;
  /** Active people for one company, primary first then by name. */
  peopleFor: (kind: PartnerCompanyKind, companyId: string) => PartnerPerson[];
  createPerson: (person: PartnerPerson) => Promise<void>;
  updatePerson: (id: string, patch: Partial<PartnerPerson>) => Promise<void>;
  removePerson: (id: string) => Promise<void>;
  /** Make one person primary for its company, unsetting any sibling primary. */
  setPrimary: (id: string) => Promise<void>;
};

const PartnerPeopleContext = createContext<PartnerPeopleContextValue | null>(null);

function order(a: PartnerPerson, b: PartnerPerson): number {
  if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  return a.name.localeCompare(b.name);
}

function localLoad(): PartnerPerson[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.people)) return [];
    return parsed.people;
  } catch {
    return [];
  }
}

function localSave(people: PartnerPerson[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schema: SCHEMA_VERSION, people } satisfies Persisted)
    );
  } catch {
    /* quota / denied — silent fail, matches contactsStore */
  }
}

async function supabaseLoad(): Promise<PartnerPerson[]> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from(PARTNER_PEOPLE_TABLE)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data as PartnerPersonRow[] | null)?.map(rowToPartnerPerson) ?? [];
}

export function PartnerPeopleProvider({ children }: { children: ReactNode }) {
  const backend: PartnerPeopleBackend = hasSupabase() ? "supabase" : "localStorage";
  const [people, setPeople] = useState<PartnerPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const peopleRef = useRef<PartnerPerson[]>([]);

  useEffect(() => {
    peopleRef.current = people;
  }, [people]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setPeople(remote);
        } else if (!cancelled) {
          setPeople(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setPeople(localLoad());
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
    if (!loading && backend === "localStorage") localSave(people);
  }, [people, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      setPeople(await supabaseLoad());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const createPerson = useCallback(
    async (person: PartnerPerson) => {
      setPeople((prev) => [...prev, person]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(PARTNER_PEOPLE_TABLE)
          .insert(partnerPersonToRow(person));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setPeople((prev) => prev.filter((p) => p.id !== person.id));
        throw e;
      }
    },
    [backend]
  );

  const updatePerson = useCallback(
    async (id: string, patch: Partial<PartnerPerson>) => {
      const previous = peopleRef.current;
      setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const merged = { ...previous.find((p) => p.id === id), ...patch } as PartnerPerson;
        const { error: upErr } = await sb
          .from(PARTNER_PEOPLE_TABLE)
          .update(partnerPersonToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setPeople(previous);
        throw e;
      }
    },
    [backend]
  );

  const removePerson = useCallback(
    async (id: string) => {
      const previous = peopleRef.current;
      setPeople((prev) => prev.filter((p) => p.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(PARTNER_PEOPLE_TABLE).delete().eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setPeople(previous);
        throw e;
      }
    },
    [backend]
  );

  const setPrimary = useCallback(
    async (id: string) => {
      const previous = peopleRef.current;
      const target = previous.find((p) => p.id === id);
      if (!target) return;
      const sameCompany = (p: PartnerPerson) =>
        p.supplierId === target.supplierId && p.subtradeId === target.subtradeId;
      setPeople((prev) =>
        prev.map((p) =>
          sameCompany(p) ? { ...p, isPrimary: p.id === id } : p
        )
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const siblings = previous.filter(sameCompany);
        await Promise.all(
          siblings.map((p) =>
            sb
              .from(PARTNER_PEOPLE_TABLE)
              .update({ is_primary: p.id === id })
              .eq("id", p.id)
          )
        );
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setPeople(previous);
        throw e;
      }
    },
    [backend]
  );

  const peopleFor = useCallback(
    (kind: PartnerCompanyKind, companyId: string) =>
      people
        .filter((p) => p.active)
        .filter((p) =>
          kind === "supplier" ? p.supplierId === companyId : p.subtradeId === companyId
        )
        .sort(order),
    [people]
  );

  const value = useMemo(
    () => ({
      people,
      loading,
      backend,
      error,
      refresh,
      peopleFor,
      createPerson,
      updatePerson,
      removePerson,
      setPrimary,
    }),
    [people, loading, backend, error, refresh, peopleFor, createPerson, updatePerson, removePerson, setPrimary]
  );

  return (
    <PartnerPeopleContext.Provider value={value}>{children}</PartnerPeopleContext.Provider>
  );
}

export function usePartnerPeople(): PartnerPeopleContextValue {
  const ctx = useContext(PartnerPeopleContext);
  if (!ctx) {
    throw new Error("usePartnerPeople must be used inside <PartnerPeopleProvider>");
  }
  return ctx;
}
