-- Walking skeleton 3: what `extract-receipt` writes. A draft now carries
-- the store, date and where its values came from (`source`: 'mock' until
-- a real AI adapter exists); a failed extraction carries an error code.
-- The two functions write a receipt and its items in one transaction, as
-- the caller (security invoker), so RLS decides whose receipt they touch.
-- Reversible by dropping the two functions, the constraints and the four
-- columns.

alter table public.receipts
  add column store_name text,
  add column purchased_on date,
  add column source text
    constraint receipts_source_known check (source in ('mock', 'ai')),
  add column error_code text
    constraint receipts_error_code_known
      check (error_code in ('extraction_invalid', 'extraction_failed')),
  -- A draft always says where its values came from, and a failure why.
  add constraint receipts_draft_has_source
    check (status <> 'needs_review' or source is not null),
  add constraint receipts_failure_has_code
    check (status <> 'failed' or error_code is not null);

-- Replaces whatever a previous extraction left: the receipt becomes a
-- draft (`needs_review`) with exactly `p_items`. A saved receipt, or one
-- the caller does not own, is refused.
create function public.record_extraction(
  p_receipt_id uuid,
  p_source text,
  p_store_name text,
  p_purchased_on date,
  p_total_kurus bigint,
  p_items jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.receipts
     set status = 'needs_review', source = p_source, error_code = null,
         store_name = p_store_name, purchased_on = p_purchased_on,
         total_kurus = p_total_kurus
   where id = p_receipt_id and status <> 'saved';
  if not found then
    raise exception 'receipt not found or already saved' using errcode = 'P0002';
  end if;
  delete from public.receipt_items where receipt_id = p_receipt_id;
  insert into public.receipt_items (receipt_id, raw_text, name, amount_kurus)
  select p_receipt_id, item.raw_text, item.name, item.amount_kurus
    from jsonb_to_recordset(p_items)
      as item(raw_text text, name text, amount_kurus bigint);
end;
$$;

-- The receipt becomes `failed` with a code and no items.
create function public.record_extraction_failure(
  p_receipt_id uuid,
  p_source text,
  p_error_code text
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.receipts
     set status = 'failed', source = p_source, error_code = p_error_code,
         store_name = null, purchased_on = null, total_kurus = null
   where id = p_receipt_id and status <> 'saved';
  if not found then
    raise exception 'receipt not found or already saved' using errcode = 'P0002';
  end if;
  delete from public.receipt_items where receipt_id = p_receipt_id;
end;
$$;

revoke execute on function public.record_extraction(uuid, text, text, date, bigint, jsonb)
  from public, anon;
revoke execute on function public.record_extraction_failure(uuid, text, text)
  from public, anon;
grant execute on function public.record_extraction(uuid, text, text, date, bigint, jsonb)
  to authenticated;
grant execute on function public.record_extraction_failure(uuid, text, text)
  to authenticated;
