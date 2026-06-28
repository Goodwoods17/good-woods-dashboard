-- Invoices — transactional review/match saves (issue #171, Phase C audit #5).
--
-- saveReviewedInvoice / saveInvoiceMatch (invoicesData.ts) used to fire the
-- header update + N per-line updates as SEPARATE PostgREST round-trips
-- (Promise.all). A mid-batch failure left the invoice half-saved: the header
-- flipped (status='reviewed' / supplier_id set) while only some lines persisted,
-- with no transaction to roll the batch back. This wraps each save in a single
-- plpgsql function — a function runs in one implicit transaction, so either every
-- row lands or none do.
--
-- SECURITY: SECURITY INVOKER (the default) — these run as the calling role, so
-- the existing authenticated-all / anon-none RLS on invoices + invoice_lines
-- still applies unchanged (no privilege escalation; mirrors set_preferred_offer).
-- Line writes are scoped to `invoice_id = p_invoice_id` so a payload can never
-- reach into another invoice's lines.
--
-- ADDITIVE-ONLY per the overnight-build mandate: two new functions + grants; no
-- table/column/RLS change, no row mutation beyond what the app already did. The
-- owner applies this to prod AFTER review.
--
-- search_path is pinned to '' (lint 0011_function_search_path_mutable); every
-- object is therefore schema-qualified.

-- ─── save_reviewed_invoice — header + all lines, one transaction ─────────────
-- Returns the updated invoice row (the caller maps it back to an Invoice).
create or replace function public.save_reviewed_invoice(
  p_invoice_id uuid,
  p_header     jsonb,
  p_lines      jsonb
) returns public.invoices
language plpgsql
as $$
declare
  v_invoice public.invoices;
begin
  update public.invoices set
    status         = 'reviewed',
    supplier       = p_header->>'supplier',
    invoice_number = p_header->>'invoice_number',
    issue_date     = (p_header->>'issue_date')::date,
    due_date       = (p_header->>'due_date')::date,
    po_ref         = p_header->>'po_ref',
    pre_tax_total  = (p_header->>'pre_tax_total')::numeric,
    gst            = (p_header->>'gst')::numeric,
    pst            = (p_header->>'pst')::numeric,
    total          = (p_header->>'total')::numeric
  where id = p_invoice_id
  returning * into v_invoice;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id
      using errcode = 'no_data_found';
  end if;

  -- Update every supplied line in the same transaction. Scoped to this
  -- invoice's lines so a stray id can't mutate another bill.
  update public.invoice_lines l set
    qty         = (e->>'qty')::numeric,
    sku         = e->>'sku',
    description = e->>'description',
    unit        = e->>'unit',
    unit_price  = (e->>'unit_price')::numeric,
    amount      = (e->>'amount')::numeric,
    tax_flag    = (e->>'tax_flag')::boolean
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as e
  where l.id = (e->>'id')::uuid
    and l.invoice_id = p_invoice_id;

  return v_invoice;
end;
$$;

alter function public.save_reviewed_invoice(uuid, jsonb, jsonb)
  set search_path = '';
grant execute on function public.save_reviewed_invoice(uuid, jsonb, jsonb)
  to authenticated;

-- ─── save_invoice_match — supplier + line job/kind, one transaction ──────────
-- Does NOT change invoice status (the invoice stays `reviewed` until posted).
create or replace function public.save_invoice_match(
  p_invoice_id  uuid,
  p_supplier_id uuid,
  p_lines       jsonb
) returns public.invoices
language plpgsql
as $$
declare
  v_invoice public.invoices;
begin
  update public.invoices set
    supplier_id = p_supplier_id
  where id = p_invoice_id
  returning * into v_invoice;

  if not found then
    raise exception 'Invoice % not found', p_invoice_id
      using errcode = 'no_data_found';
  end if;

  -- job_id is TEXT (jobs.id is text — 20260626000000_invoices_slice4_matching),
  -- line_kind is the nullable material|subtrade tag (20260711000000).
  update public.invoice_lines l set
    job_id    = e->>'job_id',
    line_kind = e->>'line_kind'
  from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) as e
  where l.id = (e->>'id')::uuid
    and l.invoice_id = p_invoice_id;

  return v_invoice;
end;
$$;

alter function public.save_invoice_match(uuid, uuid, jsonb)
  set search_path = '';
grant execute on function public.save_invoice_match(uuid, uuid, jsonb)
  to authenticated;
