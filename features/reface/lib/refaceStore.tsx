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
import { getSupabase, hasSupabase } from "@shared/lib/supabase";
import { formatError } from "@shared/lib/formatError";
import type { RefaceElement, RefacePhoto, RefaceProject } from "./types";
import {
  assembleProjects,
  elementToRow,
  photoToRow,
  projectToRow,
  REFACE_ELEMENTS_TABLE,
  REFACE_PHOTOS_TABLE,
  REFACE_PROJECTS_TABLE,
  type RefaceElementRow,
  type RefacePhotoRow,
  type RefaceProjectRow,
} from "./refaceRowMap";

const STORAGE_KEY = "gw_reface_v1";
const SCHEMA_VERSION = 1;

type Persisted = { schema: number; projects: RefaceProject[] };

export type RefaceBackend = "supabase" | "localStorage";

/** Fields a project edit may touch (photos/elements have their own mutators). */
export type ProjectPatch = Partial<
  Pick<RefaceProject, "name" | "jobId" | "notes" | "orderSettings">
>;

type RefaceContextValue = {
  projects: RefaceProject[];
  loading: boolean;
  backend: RefaceBackend;
  error: string | null;
  refresh: () => Promise<void>;
  createProject: (project: RefaceProject) => Promise<void>;
  updateProject: (id: string, patch: ProjectPatch) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  addPhoto: (photo: RefacePhoto) => Promise<void>;
  deletePhoto: (id: string) => Promise<void>;
  addElement: (element: RefaceElement) => Promise<void>;
  addElements: (elements: RefaceElement[]) => Promise<void>;
  updateElement: (id: string, patch: Partial<RefaceElement>) => Promise<void>;
  deleteElement: (id: string) => Promise<void>;
};

const RefaceContext = createContext<RefaceContextValue | null>(null);

// ---------------------------------------------------------------------------
// Pure nested-tree updaters (project -> photos -> elements)
// ---------------------------------------------------------------------------

function mapProject(
  list: RefaceProject[],
  id: string,
  fn: (p: RefaceProject) => RefaceProject
): RefaceProject[] {
  return list.map((p) => (p.id === id ? fn(p) : p));
}

function addElementToTree(list: RefaceProject[], element: RefaceElement): RefaceProject[] {
  return list.map((p) => ({
    ...p,
    photos: p.photos.map((ph) =>
      ph.id === element.photoId ? { ...ph, elements: [...ph.elements, element] } : ph
    ),
  }));
}

function updateElementInTree(
  list: RefaceProject[],
  id: string,
  fn: (el: RefaceElement) => RefaceElement
): RefaceProject[] {
  return list.map((p) => ({
    ...p,
    photos: p.photos.map((ph) => ({
      ...ph,
      elements: ph.elements.map((el) => (el.id === id ? fn(el) : el)),
    })),
  }));
}

function removeElementFromTree(list: RefaceProject[], id: string): RefaceProject[] {
  return list.map((p) => ({
    ...p,
    photos: p.photos.map((ph) => ({
      ...ph,
      elements: ph.elements.filter((el) => el.id !== id),
    })),
  }));
}

function findElement(list: RefaceProject[], id: string): RefaceElement | undefined {
  for (const p of list) {
    for (const ph of p.photos) {
      const el = ph.elements.find((e) => e.id === id);
      if (el) return el;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// localStorage backend
// ---------------------------------------------------------------------------

function localLoad(): RefaceProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: Persisted = JSON.parse(raw);
    if (parsed.schema !== SCHEMA_VERSION || !Array.isArray(parsed.projects)) return [];
    return parsed.projects;
  } catch {
    return [];
  }
}

function localSave(projects: RefaceProject[]) {
  if (typeof window === "undefined") return;
  try {
    const payload: Persisted = { schema: SCHEMA_VERSION, projects };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / denied — silent fail, matches the other stores */
  }
}

// ---------------------------------------------------------------------------
// Supabase backend
// ---------------------------------------------------------------------------

async function supabaseLoad(): Promise<RefaceProject[]> {
  const sb = getSupabase();
  const [projRes, photoRes, elemRes] = await Promise.all([
    sb.from(REFACE_PROJECTS_TABLE).select("*").order("updated_at", { ascending: false }),
    sb.from(REFACE_PHOTOS_TABLE).select("*").order("sort", { ascending: true }),
    sb.from(REFACE_ELEMENTS_TABLE).select("*").order("sort", { ascending: true }),
  ]);
  if (projRes.error) throw projRes.error;
  if (photoRes.error) throw photoRes.error;
  if (elemRes.error) throw elemRes.error;
  return assembleProjects(
    (projRes.data as RefaceProjectRow[] | null) ?? [],
    (photoRes.data as RefacePhotoRow[] | null) ?? [],
    (elemRes.data as RefaceElementRow[] | null) ?? []
  );
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function RefaceProvider({ children }: { children: ReactNode }) {
  const backend: RefaceBackend = hasSupabase() ? "supabase" : "localStorage";
  const [projects, setProjects] = useState<RefaceProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const projectsRef = useRef<RefaceProject[]>([]);

  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (backend === "supabase") {
          const remote = await supabaseLoad();
          if (!cancelled) setProjects(remote);
        } else {
          if (!cancelled) setProjects(localLoad());
        }
      } catch (e) {
        if (!cancelled) {
          setError(formatError(e));
          setProjects(localLoad());
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
    if (!loading && backend === "localStorage") localSave(projects);
  }, [projects, loading, backend]);

  const refresh = useCallback(async () => {
    if (backend !== "supabase") return;
    setLoading(true);
    try {
      setProjects(await supabaseLoad());
      setError(null);
    } catch (e) {
      setError(formatError(e));
    } finally {
      setLoading(false);
    }
  }, [backend]);

  // --- Projects ---

  const createProject = useCallback(
    async (project: RefaceProject) => {
      setProjects((prev) => [project, ...prev]);
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_PROJECTS_TABLE).insert(projectToRow(project));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects((prev) => prev.filter((p) => p.id !== project.id));
        throw e;
      }
    },
    [backend]
  );

  const updateProject = useCallback(
    async (id: string, patch: ProjectPatch) => {
      const previous = projectsRef.current;
      const now = new Date().toISOString();
      setProjects((prev) => mapProject(prev, id, (p) => ({ ...p, ...patch, updatedAt: now })));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const current = previous.find((p) => p.id === id);
        if (!current) return;
        const merged: RefaceProject = { ...current, ...patch, updatedAt: now };
        const { error: upErr } = await sb
          .from(REFACE_PROJECTS_TABLE)
          .update(projectToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  const deleteProject = useCallback(
    async (id: string) => {
      const previous = projectsRef.current;
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (backend !== "supabase") return;
      try {
        // photos + elements cascade via ON DELETE CASCADE.
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_PROJECTS_TABLE).delete().eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  // --- Photos ---

  const addPhoto = useCallback(
    async (photo: RefacePhoto) => {
      const previous = projectsRef.current;
      setProjects((prev) =>
        mapProject(prev, photo.projectId, (p) => ({ ...p, photos: [...p.photos, photo] }))
      );
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_PHOTOS_TABLE).insert(photoToRow(photo));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  const deletePhoto = useCallback(
    async (id: string) => {
      const previous = projectsRef.current;
      setProjects((prev) =>
        prev.map((p) => ({ ...p, photos: p.photos.filter((ph) => ph.id !== id) }))
      );
      if (backend !== "supabase") return;
      try {
        // elements cascade via ON DELETE CASCADE.
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_PHOTOS_TABLE).delete().eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  // --- Elements ---

  const addElement = useCallback(
    async (element: RefaceElement) => {
      const previous = projectsRef.current;
      setProjects((prev) => addElementToTree(prev, element));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_ELEMENTS_TABLE).insert(elementToRow(element));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  const addElements = useCallback(
    async (elements: RefaceElement[]) => {
      if (elements.length === 0) return;
      const previous = projectsRef.current;
      setProjects((prev) => elements.reduce(addElementToTree, prev));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb
          .from(REFACE_ELEMENTS_TABLE)
          .insert(elements.map(elementToRow));
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  const updateElement = useCallback(
    async (id: string, patch: Partial<RefaceElement>) => {
      const previous = projectsRef.current;
      setProjects((prev) => updateElementInTree(prev, id, (el) => ({ ...el, ...patch })));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const current = findElement(previous, id);
        if (!current) return;
        const merged: RefaceElement = { ...current, ...patch };
        const { error: upErr } = await sb
          .from(REFACE_ELEMENTS_TABLE)
          .update(elementToRow(merged))
          .eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  const deleteElement = useCallback(
    async (id: string) => {
      const previous = projectsRef.current;
      setProjects((prev) => removeElementFromTree(prev, id));
      if (backend !== "supabase") return;
      try {
        const sb = getSupabase();
        const { error: upErr } = await sb.from(REFACE_ELEMENTS_TABLE).delete().eq("id", id);
        if (upErr) throw upErr;
        setError(null);
      } catch (e) {
        setError(formatError(e));
        setProjects(previous);
        throw e;
      }
    },
    [backend]
  );

  return (
    <RefaceContext.Provider
      value={{
        projects,
        loading,
        backend,
        error,
        refresh,
        createProject,
        updateProject,
        deleteProject,
        addPhoto,
        deletePhoto,
        addElement,
        addElements,
        updateElement,
        deleteElement,
      }}
    >
      {children}
    </RefaceContext.Provider>
  );
}

export function useReface(): RefaceContextValue {
  const ctx = useContext(RefaceContext);
  if (!ctx) {
    throw new Error("useReface must be used inside <RefaceProvider>");
  }
  return ctx;
}

export function useRefaceProject(id: string | null | undefined): RefaceProject | undefined {
  const { projects } = useReface();
  if (!id) return undefined;
  return projects.find((p) => p.id === id);
}
