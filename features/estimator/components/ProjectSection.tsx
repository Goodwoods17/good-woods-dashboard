"use client";

import { FieldInput } from "./inputs";

export function ProjectSection({
  client,
  project,
  onClient,
  onProject,
}: {
  client: string;
  project: string;
  onClient: (v: string) => void;
  onProject: (v: string) => void;
}) {
  return (
    <section className="bg-surface border border-border rounded-lg p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-3">Project</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldInput
          label="Client"
          value={client}
          onChange={onClient}
          placeholder="e.g. SayWell Developments"
        />
        <FieldInput
          label="Project"
          value={project}
          onChange={onProject}
          placeholder="e.g. Suite 305 kitchen + island"
        />
      </div>
    </section>
  );
}
