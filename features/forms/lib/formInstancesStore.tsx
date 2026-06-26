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
import type {
  FormInstance,
  FormInstanceField,
  FormShareLink,
  FormTemplate,
  FormTemplateField,
  RecipientType,
} from "@shared/lib/types";
import {
  FORM_INSTANCES_TABLE,
  FORM_INSTANCE_FIELDS_TABLE,
  FORM_SHARE_LINKS_TABLE,
  getSupabase,
  hasSupabase,
} from "@shared/lib/supabase";
import {
  formShareLinkToRow,
  rowToFormShareLink,
  type FormShareLinkRow,
} from "./formShareLinksRowMap";
import { generateShareToken } from "./shareLink";
import { stampSentAt } from "./shareLinkStatus";
import { formatError } from "@shared/lib/formatError";
import {
  formInstanceFieldToRow,
  formInstanceToRow,
  rowToFormInstance,
  rowToFormInstanceField,
  type FormInstanceFieldRow,
  type FormInstanceRow,
} from "./formInstancesRowMap";
import { snapshotTemplate } from "./snapshot";
import { isInstanceComplete } from "./completion";
import { removeFormPhoto } from "./storage";

const INSTANCES_KEY = "gw_form_instances_v1";
const FIELDS_KEY = "gw_form_instance_fields_v1";
const SHARE_LINKS_KEY = "gw_form_share_links_v1";
const SCHEMA_VERSION = 1;

type PersistedInstances = { schema: number; instances: FormInstance[] };
type PersistedFields = { schema: number; fields: FormInstanceField[] };
type PersistedShareLinks = { schema: number; links: FormShareLink[] };

export type FormsBackend = "supabase" | "localStorage";

type FormInstancesContextValue = {
  instances: FormInstance[];
  fields: FormInstanceField[];
  shareLinks: FormShareLink[];
  loading: boolean;
  backend: FormsBackend;
  error: string | null;
  refresh: () => Promise<void>;
  instancesForJob: (jobId: string) => FormInstance[];
  /** Standalone instances (jobId = null). */
  standaloneInstances: FormInstance[];
  fieldsForInstance: (instanceId: string) => FormInstanceField[];
  /** Share links for one instance, sorted by createdAt ascending. */
  shareLinksForInstance: (instanceId: string) => FormShareLink[];
  /** Snapshot a template onto a job (or null = standalone). Returns the new instance. */
  attachTemplate: (
    template: FormTemplate,
    templateFields: FormTemplateField[],
    jobId: string | null
  ) => Promise<FormInstance>;
  /** Patch a single instance field's answer (checked/value/note/photoUrl). Bumps draft → in_progress. */
  updateInstanceField: (fieldId: string, patch: Partial<FormInstanceField>) => Promise<void>;
  /** Add an ad-hoc field to an existing instance (per-instance edit, does not touch the master). */
  addInstanceField: (field: FormInstanceField) => Promise<void>;
  /** Update an instance field's definition (label/type/config — not the answer). */
  editInstanceField: (id: string, patch: Partial<FormInstanceField>) => Promise<void>;
  /** Delete a field from an instance. */
  deleteInstanceField: (id: string) => Promise<void>;
  /** Update instance metadata (title, phase, status, sortOrder). */
  updateInstance: (id: string, patch: Partial<FormInstance>) => Promise<void>;
  /**
   * Lock a fully-filled instance: status → complete, stamp completed_at +
   * completed_by. Throws if any required field still fails its registry gate
   * (the lock is gated, never silently skipped). The fill surface goes
   * read-only on `status === "complete"`.
   */
  completeInstance: (id: string, completedBy: string) => Promise<void>;
  /**
   * Owner-only reopen: status → in_progress, clear completed_at/completed_by,
   * and void the prior signoff PDF (signoff_path → null). Best-effort removes
   * the stored PDF object.
   */
  reopenInstance: (id: string) => Promise<void>;
  /** Record the signoff PDF storage path on a completed instance. */
  setSignoffPath: (id: string, signoffPath: string) => Promise<void>;
  /** Delete an instance and all its fields. */
  deleteInstance: (id: string) => Promise<void>;
  /**
   * Mint a no-login share link for an instance (Forms P2). Owner-only path —
   * the authenticated write is RLS-gated; the public /f/<token> portal reads it
   * via the service role. lockedFieldIds are read-only for the recipient
   * (enforced server-side). Returns the new link (its token forms the URL).
   */
  createShareLink: (args: {
    instanceId: string;
    recipientName?: string | null;
    recipientType?: RecipientType;
    lockedFieldIds?: string[];
    createdBy?: string | null;
  }) => Promise<FormShareLink>;
  /**
   * Revoke a share link (sets revoked_at). The /f/<token> portal will show
   * the inactive state after this. Does NOT delete the row (audit trail).
   */
  revokeShareLink: (linkId: string) => Promise<void>;
  /**
   * Stamp sent_at on the first share action (copy link / open mail draft).
   * Idempotent — never overwrites an existing sent_at. Updates both the in-
   * memory state and Supabase (if configured).
   */
  stampShareLinkSent: (linkId: string) => Promise<void>;
  /**
   * Update the locked_field_ids on a draft link (before it has been sent).
   * Once sent the lock list is frozen to preserve what the recipient was shown.
   */
  updateShareLinkLocks: (linkId: string, lockedFieldIds: string[]) => Promise<void>;
};

const FormInstancesContext = createContext<FormInstancesContextValue | null>(null);

function localLoadInstances(): FormInstance[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(INSTANCES_KEY);
    if (!raw) return [];
    const parsed: PersistedInstances = JSON.parse(raw);
    return parsed.schema === SCHEMA_VERSION && Array.isArray(parsed.instances)
      ? parsed.instances
      : [];
  } catch {
    return [];
  }
}

function localLoadFields(): FormInstanceField[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(FIELDS_KEY);
    if (!raw) return [];
    const parsed: PersistedFields = JSON.parse(raw);
    return parsed.schema === SCHEMA_VERSION && Array.isArray(parsed.fields) ? parsed.fields : [];
  } catch {
    return [];
  }
}

function localSaveInstances(instances: FormInstance[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      INSTANCES_KEY,
      JSON.stringify({ schema: SCHEMA_VERSION, instances })
    );
  } catch {
    /* quota / denied — silent fail */
  }
}

function localSaveFields(fields: FormInstanceField[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(FIELDS_KEY, JSON.stringify({ schema: SCHEMA_VERSION, fields }));
  } catch {
    /* quota / denied */
  }
}

function localLoadShareLinks(): FormShareLink[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SHARE_LINKS_KEY);
    if (!raw) return [];
    const parsed: PersistedShareLinks = JSON.parse(raw);
    return parsed.schema === SCHEMA_VERSION && Array.isArray(parsed.links) ? parsed.links : [];
  } catch {
    return [];
  }
}

function localSaveShareLinks(links: FormShareLink[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      SHARE_LINKS_KEY,
      JSON.stringify({ schema: SCHEMA_VERSION, links })
    );
  } catch {
    /* quota / denied */
  }
}

async function supabaseLoad(): Promise<{
  instances: FormInstance[];
  fields: FormInstanceField[];
  shareLinks: FormShareLink[];
}> {
  const sb = getSupabase();
  const [insRes, fldRes, linksRes] = await Promise.all([
    sb.from(FORM_INSTANCES_TABLE).select("*").order("sort_order", { ascending: true }),
    sb.from(FORM_INSTANCE_FIELDS_TABLE).select("*").order("sort_order", { ascending: true }),
    sb.from(FORM_SHARE_LINKS_TABLE).select("*").order("created_at", { ascending: true }),
  ]);
  if (insRes.error) throw insRes.error;
  if (fldRes.error) throw fldRes.error;
  if (linksRes.error) throw linksRes.error;
  return {
    instances: (insRes.data as FormInstanceRow[] | null)?.map(rowToFormInstance) ?? [],
    fields: (fldRes.data as FormInstanceFieldRow[] | null)?.map(rowToFormInstanceField) ?? [],
    shareLinks: (linksRes.data as FormShareLinkRow[] | null)?.map(rowToFormShareLink) ?? [],
  };
}

export function FormInstancesProvider({ children }: { children: ReactNode }) {
  const backend: FormsBackend = hasSupabase() ? "supabase" : "localStorage";
  const [instances, setInstances] = useState<FormInstance[]>([]);
  const [fields, setFields] = useState<FormInstanceField[]>([]);
  const [shareLinks, setShareLinks] = useState<FormShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const instancesRef = useRef<FormInstance[]>([]);
  const fieldsRef = useRef<FormInstanceField[]>([]);
  const shareLinksRef = useRef<FormShareLink[]>([]);

  useEffect(() => {
    instancesRef.current = instances;
  }, [instances]);
  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);
  useEffect(() => {
    shareLinksRef.current = shareLinks;
  }, [shareLinks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) {
            setInstances(remote.instances);
            setFields(remote.fields);
            setShareLinks(remote.shareLinks);
          }
        } else if (!cancelled) {
          setInstances(localLoadInstances());
          setFields(localLoadFields());
          setShareLinks(localLoadShareLinks());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setInstances(localLoadInstances());
          setFields(localLoadFields());
          setShareLinks(localLoadShareLinks());
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backend]);

  // Persist to localStorage in fallback mode (Supabase persists per-write).
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveInstances(instances);
  }, [instances, loading, backend]);
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveFields(fields);
  }, [fields, loading, backend]);
  useEffect(() => {
    if (!loading && backend === "localStorage") localSaveShareLinks(shareLinks);
  }, [shareLinks, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      const remote = await supabaseLoad();
      setInstances(remote.instances);
      setFields(remote.fields);
      setShareLinks(remote.shareLinks);
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  const attachTemplate = useCallback(
    async (
      template: FormTemplate,
      templateFields: FormTemplateField[],
      jobId: string | null
    ): Promise<FormInstance> => {
      const { instance, fields: snapFields } = snapshotTemplate(template, templateFields, jobId);
      // Optimistic.
      setInstances((prev) => [...prev, instance]);
      setFields((prev) => [...prev, ...snapFields]);

      if (backend !== "supabase") return instance;
      try {
        const sb = getSupabase();
        const { error: insErr } = await sb
          .from(FORM_INSTANCES_TABLE)
          .insert(formInstanceToRow(instance));
        if (insErr) throw insErr;
        if (snapFields.length) {
          const { error: fldErr } = await sb
            .from(FORM_INSTANCE_FIELDS_TABLE)
            .insert(snapFields.map(formInstanceFieldToRow));
          if (fldErr) throw fldErr;
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
        // Roll back the optimistic insert.
        setInstances((prev) => prev.filter((i) => i.id !== instance.id));
        setFields((prev) => prev.filter((f) => f.instanceId !== instance.id));
        throw e;
      }
      return instance;
    },
    [backend]
  );

  const updateInstanceField = useCallback(
    async (fieldId: string, patch: Partial<FormInstanceField>) => {
      const prevFields = fieldsRef.current;
      const prevInstances = instancesRef.current;
      const target = prevFields.find((f) => f.id === fieldId);
      if (!target) return;

      // Touching a draft moves it to in_progress.
      const inst = prevInstances.find((i) => i.id === target.instanceId);
      const bumpInstance = inst && inst.status === "draft";

      setFields((prev) => prev.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)));
      if (bumpInstance) {
        setInstances((prev) =>
          prev.map((i) => (i.id === inst!.id ? { ...i, status: "in_progress" } : i))
        );
      }

      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const merged = { ...target, ...patch };
        const row = formInstanceFieldToRow(merged);
        const { error: upErr } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .update({
            value: row.value,
            checked: row.checked,
            note: row.note,
            photo_url: row.photo_url,
            // Signature fields stash their audit pair (signerName + signedAt) in
            // config at fill time, so the answer write must persist config too.
            config: row.config,
          })
          .eq("id", fieldId);
        if (upErr) throw upErr;
        if (bumpInstance) {
          const { error: insErr } = await sb
            .from(FORM_INSTANCES_TABLE)
            .update({ status: "in_progress" })
            .eq("id", inst!.id);
          if (insErr) throw insErr;
        }
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prevFields);
        setInstances(prevInstances);
        throw e;
      }
    },
    [backend]
  );

  // ─── Per-instance ad-hoc field edits ────────────────────────────────────

  const addInstanceField = useCallback(
    async (field: FormInstanceField) => {
      setFields((prev) => [...prev, field]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .insert(formInstanceFieldToRow(field));
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields((prev) => prev.filter((f) => f.id !== field.id));
        throw e;
      }
    },
    [backend]
  );

  const editInstanceField = useCallback(
    async (id: string, patch: Partial<FormInstanceField>) => {
      const prev = fieldsRef.current;
      setFields((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = prev.find((f) => f.id === id);
        if (!target) return;
        const merged = formInstanceFieldToRow({ ...target, ...patch });
        const { error: err } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .update({ label: merged.label, type: merged.type, config: merged.config })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prev);
        throw e;
      }
    },
    [backend]
  );

  const deleteInstanceField = useCallback(
    async (id: string) => {
      const prev = fieldsRef.current;
      setFields((f) => f.filter((x) => x.id !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb.from(FORM_INSTANCE_FIELDS_TABLE).delete().eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setFields(prev);
        throw e;
      }
    },
    [backend]
  );

  const updateInstance = useCallback(
    async (id: string, patch: Partial<FormInstance>) => {
      setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const target = instancesRef.current.find((i) => i.id === id);
        if (!target) return;
        const merged = formInstanceToRow({ ...target, ...patch });
        const { error: err } = await sb
          .from(FORM_INSTANCES_TABLE)
          .update({
            title: merged.title,
            phase: merged.phase,
            status: merged.status,
            sort_order: merged.sort_order,
          })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        throw e;
      }
    },
    [backend]
  );

  const completeInstance = useCallback(
    async (id: string, completedBy: string) => {
      const prevInstances = instancesRef.current;
      const target = prevInstances.find((i) => i.id === id);
      if (!target) return;
      const instanceFields = fieldsRef.current.filter((f) => f.instanceId === id);
      if (!isInstanceComplete(instanceFields)) {
        throw new Error("Form has unfilled required fields — fill them before completing.");
      }
      const completedAt = new Date().toISOString();
      setInstances((prev) =>
        prev.map((i) => (i.id === id ? { ...i, status: "complete", completedAt, completedBy } : i))
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_INSTANCES_TABLE)
          .update({ status: "complete", completed_at: completedAt, completed_by: completedBy })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setInstances(prevInstances);
        throw e;
      }
    },
    [backend]
  );

  const reopenInstance = useCallback(
    async (id: string) => {
      const prevInstances = instancesRef.current;
      const target = prevInstances.find((i) => i.id === id);
      if (!target) return;
      const priorSignoff = target.signoffPath;
      setInstances((prev) =>
        prev.map((i) =>
          i.id === id
            ? {
                ...i,
                status: "in_progress",
                completedAt: null,
                completedBy: null,
                signoffPath: null,
              }
            : i
        )
      );
      // Best-effort: void the prior PDF object (no-op offline / inline paths).
      if (priorSignoff) {
        void removeFormPhoto(priorSignoff).catch(() => {});
      }
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_INSTANCES_TABLE)
          .update({
            status: "in_progress",
            completed_at: null,
            completed_by: null,
            signoff_path: null,
          })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setInstances(prevInstances);
        throw e;
      }
    },
    [backend]
  );

  const setSignoffPath = useCallback(
    async (id: string, signoffPath: string) => {
      const prevInstances = instancesRef.current;
      setInstances((prev) => prev.map((i) => (i.id === id ? { ...i, signoffPath } : i)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_INSTANCES_TABLE)
          .update({ signoff_path: signoffPath })
          .eq("id", id);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setInstances(prevInstances);
        throw e;
      }
    },
    [backend]
  );

  const deleteInstance = useCallback(
    async (id: string) => {
      const prevInstances = instancesRef.current;
      const prevFields = fieldsRef.current;
      setInstances((prev) => prev.filter((i) => i.id !== id));
      setFields((prev) => prev.filter((f) => f.instanceId !== id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: fErr } = await sb
          .from(FORM_INSTANCE_FIELDS_TABLE)
          .delete()
          .eq("instance_id", id);
        if (fErr) throw fErr;
        const { error: iErr } = await sb.from(FORM_INSTANCES_TABLE).delete().eq("id", id);
        if (iErr) throw iErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setInstances(prevInstances);
        setFields(prevFields);
        throw e;
      }
    },
    [backend]
  );

  const createShareLink = useCallback(
    async (args: {
      instanceId: string;
      recipientName?: string | null;
      recipientType?: RecipientType;
      lockedFieldIds?: string[];
      createdBy?: string | null;
    }): Promise<FormShareLink> => {
      const link: FormShareLink = {
        id: crypto.randomUUID(),
        instanceId: args.instanceId,
        token: generateShareToken(),
        recipientName: args.recipientName ?? null,
        recipientType: args.recipientType ?? "other",
        lockedFieldIds: args.lockedFieldIds ?? [],
        sentAt: null,
        viewedAt: null,
        submittedAt: null,
        revokedAt: null,
        createdAt: new Date().toISOString(),
        createdBy: args.createdBy ?? null,
      };
      // Optimistic.
      setShareLinks((prev) => [...prev, link]);
      if (backend !== "supabase") return link;
      const sb = getSupabase();
      const { error: err } = await sb.from(FORM_SHARE_LINKS_TABLE).insert(formShareLinkToRow(link));
      if (err) {
        setError(formatError(err));
        setShareLinks((prev) => prev.filter((l) => l.id !== link.id));
        throw err;
      }
      setError(null);
      return link;
    },
    [backend]
  );

  const revokeShareLink = useCallback(
    async (linkId: string) => {
      const prev = shareLinksRef.current;
      const revokedAt = new Date().toISOString();
      setShareLinks((links) =>
        links.map((l) => (l.id === linkId ? { ...l, revokedAt } : l))
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_SHARE_LINKS_TABLE)
          .update({ revoked_at: revokedAt })
          .eq("id", linkId);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setShareLinks(prev);
        throw e;
      }
    },
    [backend]
  );

  const stampShareLinkSent = useCallback(
    async (linkId: string) => {
      const target = shareLinksRef.current.find((l) => l.id === linkId);
      if (!target || target.sentAt !== null) return; // idempotent
      const stamped = stampSentAt(target);
      const prev = shareLinksRef.current;
      setShareLinks((links) => links.map((l) => (l.id === linkId ? stamped : l)));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_SHARE_LINKS_TABLE)
          .update({ sent_at: stamped.sentAt })
          .eq("id", linkId);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setShareLinks(prev);
        throw e;
      }
    },
    [backend]
  );

  const updateShareLinkLocks = useCallback(
    async (linkId: string, lockedFieldIds: string[]) => {
      const prev = shareLinksRef.current;
      setShareLinks((links) =>
        links.map((l) => (l.id === linkId ? { ...l, lockedFieldIds } : l))
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: err } = await sb
          .from(FORM_SHARE_LINKS_TABLE)
          .update({ locked_field_ids: lockedFieldIds })
          .eq("id", linkId);
        if (err) throw err;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setShareLinks(prev);
        throw e;
      }
    },
    [backend]
  );

  const instancesForJob = useCallback(
    (jobId: string) =>
      instances.filter((i) => i.jobId === jobId).sort((a, b) => a.sortOrder - b.sortOrder),
    [instances]
  );

  const standaloneInstances = useMemo(
    () => instances.filter((i) => i.jobId === null).sort((a, b) => a.sortOrder - b.sortOrder),
    [instances]
  );

  const fieldsForInstance = useCallback(
    (instanceId: string) =>
      fields.filter((f) => f.instanceId === instanceId).sort((a, b) => a.sortOrder - b.sortOrder),
    [fields]
  );

  const shareLinksForInstance = useCallback(
    (instanceId: string) =>
      shareLinks
        .filter((l) => l.instanceId === instanceId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [shareLinks]
  );

  const value = useMemo<FormInstancesContextValue>(
    () => ({
      instances,
      fields,
      shareLinks,
      loading,
      backend,
      error,
      refresh,
      instancesForJob,
      standaloneInstances,
      fieldsForInstance,
      shareLinksForInstance,
      attachTemplate,
      updateInstanceField,
      addInstanceField,
      editInstanceField,
      deleteInstanceField,
      updateInstance,
      completeInstance,
      reopenInstance,
      setSignoffPath,
      deleteInstance,
      createShareLink,
      revokeShareLink,
      stampShareLinkSent,
      updateShareLinkLocks,
    }),
    [
      instances,
      fields,
      shareLinks,
      loading,
      backend,
      error,
      refresh,
      instancesForJob,
      standaloneInstances,
      fieldsForInstance,
      shareLinksForInstance,
      attachTemplate,
      updateInstanceField,
      addInstanceField,
      editInstanceField,
      deleteInstanceField,
      updateInstance,
      completeInstance,
      reopenInstance,
      setSignoffPath,
      deleteInstance,
      createShareLink,
      revokeShareLink,
      stampShareLinkSent,
      updateShareLinkLocks,
    ]
  );

  return <FormInstancesContext.Provider value={value}>{children}</FormInstancesContext.Provider>;
}

export function useFormInstances(): FormInstancesContextValue {
  const ctx = useContext(FormInstancesContext);
  if (!ctx) {
    throw new Error("useFormInstances must be used inside <FormInstancesProvider>");
  }
  return ctx;
}
