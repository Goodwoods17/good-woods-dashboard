-- S7 Document revision / supersede UI (milestone #12, issue #219)
-- Adds an explicit revision lineage pointer: when Rev B supersedes Rev A,
-- Rev B.supersedes_id = Rev A.id and Rev A.is_current is flipped to false.
-- The FK is self-referencing + nullable (no link = original). ON DELETE SET NULL
-- so deleting an ancestor doesn't break the chain — the child just loses its back-pointer.

ALTER TABLE public.documents
  ADD COLUMN supersedes_id uuid REFERENCES public.documents(id) ON DELETE SET NULL;

CREATE INDEX idx_documents_supersedes
  ON public.documents(supersedes_id)
  WHERE supersedes_id IS NOT NULL;

COMMENT ON COLUMN public.documents.supersedes_id IS
  'When set, this document is the successor revision of the referenced document. '
  'The referenced doc should have is_current=false. Follow the chain (newest → oldest) '
  'for the full revision history of a document lineage.';
