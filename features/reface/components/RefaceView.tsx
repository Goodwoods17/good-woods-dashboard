"use client";

import { useState } from "react";
import { Plus, ScanLine } from "lucide-react";
import { PageHeader } from "@shared/components/layout/PageHeader";
import { Modal } from "@shared/components/ui/Modal";
import { Field } from "@shared/components/forms/FormField";
import { useReface } from "../lib/refaceStore";
import { defaultOrderSettings, type RefaceProject } from "../lib/types";
import { ProjectList } from "./ProjectList";
import { ProjectWorkspace } from "./ProjectWorkspace";

/** Top-level Reface Studio surface: project list <-> project workspace. */
export function RefaceView() {
  const { projects, loading, createProject } = useReface();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const selected = selectedId ? projects.find((p) => p.id === selectedId) : null;

  if (selected) {
    return <ProjectWorkspace project={selected} onBack={() => setSelectedId(null)} />;
  }

  async function handleCreate(name: string) {
    const now = new Date().toISOString();
    const project: RefaceProject = {
      id: crypto.randomUUID(),
      name: name.trim() || "Untitled kitchen",
      jobId: null,
      orderSettings: defaultOrderSettings(),
      notes: "",
      createdAt: now,
      updatedAt: now,
      photos: [],
    };
    await createProject(project);
    setCreating(false);
    setSelectedId(project.id);
  }

  return (
    <>
      <PageHeader
        eyebrow="Build"
        title="Reface Studio"
        subtitle={`${projects.length} measurement project${projects.length === 1 ? "" : "s"}`}
        actions={
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
          >
            <Plus className="h-4 w-4" strokeWidth={2} />
            New project
          </button>
        }
      />
      <div className="px-8 py-6 max-w-6xl">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="bg-surface rounded-xl shadow-resting h-36 animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <EmptyState onCreate={() => setCreating(true)} />
        ) : (
          <ProjectList onOpen={setSelectedId} />
        )}
      </div>

      {creating && <NewProjectModal onCreate={handleCreate} onClose={() => setCreating(false)} />}
    </>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-muted/40 p-12 text-center">
      <div className="mx-auto h-12 w-12 rounded-full bg-accent-soft grid place-items-center mb-4">
        <ScanLine className="h-6 w-6 text-accent" strokeWidth={1.5} />
      </div>
      <h3 className="font-serif text-title text-text-primary">Measure a kitchen</h3>
      <p className="text-sm text-text-secondary mt-1.5 max-w-md mx-auto">
        Photograph a kitchen, pin and size every door, drawer front, end panel and toe kick, then
        cost the New Surrey door order and export the Wood Doors form.
      </p>
      <button
        onClick={onCreate}
        className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
      >
        <Plus className="h-4 w-4" strokeWidth={2} />
        New project
      </button>
    </div>
  );
}

function NewProjectModal({
  onCreate,
  onClose,
}: {
  onCreate: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  return (
    <Modal title="New measurement project" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(name);
        }}
        className="space-y-4"
      >
        <Field label="Project name">
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Yates St kitchen reface"
            className="w-full text-sm bg-surface border border-border rounded-md px-3 py-2 placeholder:text-text-tertiary focus:outline-none focus:border-border-strong focus:ring-2 focus:ring-accent-soft transition-colors duration-fast"
          />
        </Field>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm text-text-secondary hover:text-text-primary transition-colors duration-fast"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-full bg-ink-pill text-white px-4 py-2 text-sm font-medium hover:bg-accent-active transition-colors duration-fast"
          >
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
