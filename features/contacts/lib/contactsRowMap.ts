import type {
  Contact,
  ContactKind,
  EmailEntry,
  PhoneEntry,
  RoleTag,
} from "@shared/lib/types";

export type ContactRow = {
  id: string;
  kind: ContactKind;
  parent_id: string | null;
  name: string;
  role_tags: string[];
  emails: EmailEntry[];
  phones: PhoneEntry[];
  address: string | null;
  website: string | null;
  notes: string | null;
  introduced_by_id: string | null;
  is_anchor: boolean;
  last_touched_at: string | null;
  follow_up_at: string | null;
  archived_at: string | null;
  created_at: string;
};

export function rowToContact(row: ContactRow): Contact {
  return {
    id: row.id,
    kind: row.kind,
    parentId: row.parent_id,
    name: row.name,
    roleTags: (row.role_tags ?? []) as RoleTag[],
    emails: row.emails ?? [],
    phones: row.phones ?? [],
    address: row.address,
    website: row.website,
    notes: row.notes,
    introducedById: row.introduced_by_id,
    isAnchor: row.is_anchor,
    lastTouchedAt: row.last_touched_at,
    followUpAt: row.follow_up_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  };
}

export function contactToRow(c: Contact): ContactRow {
  return {
    id: c.id,
    kind: c.kind,
    parent_id: c.parentId ?? null,
    name: c.name,
    role_tags: c.roleTags,
    emails: c.emails,
    phones: c.phones,
    address: c.address ?? null,
    website: c.website ?? null,
    notes: c.notes ?? null,
    introduced_by_id: c.introducedById ?? null,
    is_anchor: c.isAnchor,
    last_touched_at: c.lastTouchedAt ?? null,
    follow_up_at: c.followUpAt ?? null,
    archived_at: c.archivedAt ?? null,
    created_at: c.createdAt,
  };
}
