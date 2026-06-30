import type { ProjectDocument } from "@shared/lib/types";

/**
 * Pure revision-chain helpers for the Document revision / supersede UI (S7,
 * milestone #12, issue #219). These mirror the `supersedes_id` self-FK added
 * in migration 20260718000000_document_supersedes.sql.
 *
 * A "revision chain" is all documents connected by `supersedes_id` in either
 * direction — the link is a back-pointer (new.supersedes_id = old.id), so to
 * find forward links we scan the sibling set. BFS over both directions; the
 * visited-set guards against cycles if data is ever malformed.
 */

/**
 * Returns every document in the same revision lineage as `doc`, sorted
 * chronologically (oldest `createdAt` first). If `doc` has no `supersedes_id`
 * and nothing points to it, the chain is the singleton `[doc]`.
 */
export function buildRevisionChain(
  doc: ProjectDocument,
  all: ProjectDocument[]
): ProjectDocument[] {
  const byId = new Map(all.map((d) => [d.id, d]));

  // Build forward index: old.id → [ids of docs that supersede it]
  const supersededBy = new Map<string, string[]>();
  for (const d of all) {
    if (d.supersedesId) {
      const list = supersededBy.get(d.supersedesId) ?? [];
      list.push(d.id);
      supersededBy.set(d.supersedesId, list);
    }
  }

  // BFS from doc, following both the backward (supersedesId) and forward
  // (supersededBy) edges to collect the full connected component.
  const visited = new Set<string>();
  const queue: string[] = [doc.id];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const current = byId.get(id);
    if (!current) continue;

    // backward: this doc supersedes the referenced one
    if (current.supersedesId && !visited.has(current.supersedesId)) {
      queue.push(current.supersedesId);
    }

    // forward: other docs that supersede this one
    for (const nextId of supersededBy.get(id) ?? []) {
      if (!visited.has(nextId)) queue.push(nextId);
    }
  }

  return all
    .filter((d) => visited.has(d.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/**
 * True when `doc` belongs to a revision chain with at least one other member —
 * i.e., there is visible revision history worth showing in the detail pane.
 */
export function hasRevisionHistory(
  doc: ProjectDocument,
  all: ProjectDocument[]
): boolean {
  return buildRevisionChain(doc, all).length > 1;
}
