import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let client: SupabaseClient | null = null;

if (URL && ANON) {
  client = createBrowserClient(URL, ANON);
}

export function hasSupabase(): boolean {
  return client !== null;
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase client not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY."
    );
  }
  return client;
}

export const JOBS_TABLE = "jobs";
export const CONTACTS_TABLE = "contacts";
export const DOCUMENTS_TABLE = "documents";
export const JOB_PIECES_TABLE = "job_pieces";
export const DOCUMENT_ANNOTATIONS_TABLE = "document_annotations";
export const FORM_TEMPLATES_TABLE = "form_templates";
export const FORM_TEMPLATE_FIELDS_TABLE = "form_template_fields";
export const FORM_INSTANCES_TABLE = "form_instances";
export const FORM_INSTANCE_FIELDS_TABLE = "form_instance_fields";
export const FORM_SHARE_LINKS_TABLE = "form_share_links";
export const INVOICES_TABLE = "invoices";
export const INVOICE_LINES_TABLE = "invoice_lines";
export const QUICKBOOKS_CONNECTION_TABLE = "quickbooks_connection";
export const JOB_ITEMS_TABLE = "job_items";
export const JOB_ITEM_EVENTS_TABLE = "job_item_events";
export const PHASE_STEP_TEMPLATES_TABLE = "phase_step_templates";
export const SCHEDULING_MAKE_READY_ITEMS_TABLE = "scheduling_make_ready_items";
export const SCHEDULING_PHASE_CAPACITY_TABLE = "scheduling_phase_capacity";
export const COMMITMENT_LEDGER_TABLE = "commitment_ledger";
export const COMMITMENT_REVISIONS_TABLE = "commitment_revisions";
export const PRIORITY_BUMPS_TABLE = "priority_bumps";
export const SCHEDULE_SHARE_LINKS_TABLE = "schedule_share_links";
export const SCHEDULING_GOOGLE_CONNECTIONS_TABLE = "scheduling_google_connections";
export const SCHEDULING_GOOGLE_EVENTS_TABLE = "scheduling_google_events";
