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
