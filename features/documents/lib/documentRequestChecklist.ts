/**
 * "Request these files" checklist + outstanding-items status for the no-login
 * designer UPLOAD portal (S11, ADR 0022 · milestone #12). Staff mint a
 * `document_request` link with a list of named items they need; the portal shows
 * the list with a per-item satisfied state and an overall status colour
 * (gray → none, yellow → partial, green → complete) so both the uploader and the
 * staff side can see at a glance what is still outstanding.
 *
 * Pure: the requested labels live in `share_tokens.state.requestedFiles`; each
 * uploaded submission records which requested item it satisfies
 * (`state.submissions[].requestIndex`). A submission with a null / out-of-range
 * index is an "unfiled extra" — counted but it never satisfies a requested row.
 */

export type ChecklistSubmission = { requestIndex: number | null };

export type ChecklistItem = { index: number; label: string; satisfied: boolean };

export type RequestChecklist = {
  items: ChecklistItem[];
  outstandingCount: number;
  /** Uploads that don't map onto a requested row (index null / out of range). */
  extraCount: number;
  status: "none" | "partial" | "complete";
};

export function buildRequestChecklist(
  requestedFiles: string[],
  submissions: ChecklistSubmission[]
): RequestChecklist {
  const satisfiedIdx = new Set<number>();
  let extraCount = 0;
  for (const s of submissions) {
    if (
      typeof s.requestIndex === "number" &&
      s.requestIndex >= 0 &&
      s.requestIndex < requestedFiles.length
    ) {
      satisfiedIdx.add(s.requestIndex);
    } else {
      extraCount += 1;
    }
  }

  const items: ChecklistItem[] = requestedFiles.map((label, index) => ({
    index,
    label,
    satisfied: satisfiedIdx.has(index),
  }));
  const outstandingCount = items.filter((i) => !i.satisfied).length;

  let status: RequestChecklist["status"];
  if (requestedFiles.length === 0) {
    // No explicit checklist: "complete" the moment anything arrives, else "none".
    status = submissions.length > 0 ? "complete" : "none";
  } else if (outstandingCount === 0) {
    status = "complete";
  } else if (satisfiedIdx.size > 0) {
    status = "partial";
  } else {
    status = "none";
  }

  return { items, outstandingCount, extraCount, status };
}
