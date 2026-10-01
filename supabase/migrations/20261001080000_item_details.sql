-- ROADMAP v1 1: the full receipt model. Items gain brand, quantity,
-- package size, package count and category, and receipts and items keep
-- which fields the reader was unsure of ("Kontrol et"). Unknown values
-- stay null. The reader's validated output is kept as it came
-- (`extraction`), next to the person's corrections, and a saved receipt
-- keeps its printed total: the items no longer overwrite it.
-- Reversible in one commit: drop the new functions and recreate the old
-- `record_extraction_failure`,
-- `record_extraction(uuid, text, text, date, bigint, jsonb)` and
-- `save_receipt(uuid, jsonb)` from 20260930090000 and 20260930100000,
-- then drop the new constraints and columns.

alter table public.receipts
  -- What the reader returned, after @kefe/core's schema accepted it.
  add column extraction jsonb,
  add column unsure text[] not null default '{}'
    constraint receipts_unsure_known
      check (unsure <@ array['store', 'date', 'total']::text[]);

alter table public.receipt_items
  add column brand text,
  -- Weighed or counted at the till ("1,24 kg"); decimals, never floats.
  add column quantity numeric(12, 3),
  add column quantity_unit text,
  -- One package's size ("500 g"), apart from the number of packages.
  add column package_size numeric(12, 3),
  add column package_size_unit text,
  add column package_count integer,
  add column category text,
  add column unsure text[] not null default '{}',
  add constraint receipt_items_quantity_complete check (
    (quantity is null) = (quantity_unit is null)
    and (quantity is null or quantity > 0)
    and quantity_unit in ('g', 'kg', 'ml', 'l', 'adet')),
  add constraint receipt_items_package_size_complete check (
    (package_size is null) = (package_size_unit is null)
    and (package_size is null or package_size > 0)
    and package_size_unit in ('g', 'kg', 'ml', 'l', 'adet')),
  add constraint receipt_items_package_count_range
    check (package_count between 1 and 999),
  add constraint receipt_items_category_known check (category in
    ('food', 'cleaning', 'personal_care', 'clothing', 'home', 'other')),
  add constraint receipt_items_unsure_known check (unsure <@ array[
    'name', 'brand', 'quantity', 'package_size', 'package_count',
    'category', 'amount']::text[]),
  add constraint receipt_items_brand_not_blank check (brand <> '');

-- A measure in JSON ({"value": "1.24", "unit": "kg"}) checked for exact
-- decimal text, so 1.2345 is refused instead of rounded by numeric(12,3).
create function public.measure_value(p_measure jsonb) returns numeric
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_measure is null or jsonb_typeof(p_measure) = 'null' then
    return null;
  end if;
  if jsonb_typeof(p_measure->'value') <> 'string'
     or (p_measure->>'value') !~ '^\d{1,9}(\.\d{1,3})?$' then
    raise exception 'a measure needs a decimal text value' using errcode = '22023';
  end if;
  return (p_measure->>'value')::numeric;
end;
$$;

create function public.measure_unit(p_measure jsonb) returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_measure is null or jsonb_typeof(p_measure) = 'null'
              then null else p_measure->>'unit' end;
$$;

-- `p_extraction` is the reader's output exactly as @kefe/core's
-- `extractedReceiptSchema` accepted it. The receipt becomes a draft
-- (`needs_review`) with its items in printed order; a saved receipt, or
-- one the caller does not own, is refused.
drop function public.record_extraction(uuid, text, text, date, bigint, jsonb);

create function public.record_extraction(
  p_receipt_id uuid,
  p_source text,
  p_extraction jsonb
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if jsonb_typeof(p_extraction) <> 'object'
     or jsonb_typeof(p_extraction->'items') <> 'array' then
    raise exception 'p_extraction must be an object with items' using errcode = '22023';
  end if;
  update public.receipts
     set status = 'needs_review', source = p_source, error_code = null,
         store_name = p_extraction->>'store',
         purchased_on = (p_extraction->>'date')::date,
         total_kurus = (p_extraction->>'total_kurus')::bigint,
         unsure = coalesce(array(
           select jsonb_array_elements_text(p_extraction->'unsure')), '{}'),
         extraction = p_extraction
   where id = p_receipt_id and status <> 'saved';
  if not found then
    raise exception 'receipt not found or already saved' using errcode = 'P0002';
  end if;
  delete from public.receipt_items where receipt_id = p_receipt_id;
  -- Items are in printed order; `with ordinality` numbers them from 1.
  insert into public.receipt_items
    (receipt_id, line_no, raw_text, name, brand, quantity, quantity_unit,
     package_size, package_size_unit, package_count, category,
     amount_kurus, unsure)
  select p_receipt_id, item.line_no, item.value->>'raw_text',
         item.value->>'name', nullif(btrim(item.value->>'brand'), ''),
         public.measure_value(item.value->'quantity'),
         public.measure_unit(item.value->'quantity'),
         public.measure_value(item.value->'package_size'),
         public.measure_unit(item.value->'package_size'),
         (item.value->>'package_count')::integer,
         item.value->>'category',
         (item.value->>'amount_kurus')::bigint,
         coalesce(array(
           select jsonb_array_elements_text(item.value->'unsure')), '{}')
    from jsonb_array_elements(p_extraction->'items')
           with ordinality as item(value, line_no);
end;
$$;

-- A failed re-read leaves nothing of an earlier read behind.
create or replace function public.record_extraction_failure(
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
         store_name = null, purchased_on = null, total_kurus = null,
         unsure = '{}', extraction = null
   where id = p_receipt_id and status <> 'saved';
  if not found then
    raise exception 'receipt not found or already saved' using errcode = 'P0002';
  end if;
  delete from public.receipt_items where receipt_id = p_receipt_id;
end;
$$;

-- `p_items` is [{ "id": <item id>, "amount_kurus": <integer>, ... }]: the
-- items the person changed, each with its id and amount and any of
-- `name`, `brand`, `quantity`, `package_size` (measures as
-- {"value": "1.24", "unit": "kg"} or null), `package_count`, `category`
-- and `unsure`. A key left out keeps the stored value; a null clears it.
-- `p_receipt` may carry `store_name`, `purchased_on`, `total_kurus` and
-- `unsure` the same way. The saved total is the (corrected) printed
-- total, or the items' sum when no total was read. Idempotent on the
-- draft's key: a saved receipt is returned unchanged.
drop function public.save_receipt(uuid, jsonb);

create function public.save_receipt(
  p_idempotency_key uuid,
  p_items jsonb default '[]'::jsonb,
  p_receipt jsonb default '{}'::jsonb
) returns setof public.receipts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  draft public.receipts;
  wanted integer;
  changed integer;
begin
  -- The row lock makes a concurrent second save wait, then see `saved`.
  select * into draft
    from public.receipts
   where user_id = (select auth.uid()) and idempotency_key = p_idempotency_key
     for update;
  if not found then
    raise exception 'receipt not found' using errcode = 'P0002';
  end if;
  if draft.status = 'saved' then
    return next draft;
    return;
  end if;
  if draft.status <> 'needs_review' then
    raise exception 'receipt is not a draft' using errcode = '55000';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_typeof(p_receipt) <> 'object' then
    raise exception 'p_items must be an array, p_receipt an object' using errcode = '22023';
  end if;
  -- An amount that is not a whole number (12.5) fails the bigint cast.
  if exists (
    select 1 from jsonb_array_elements(p_items) as e(value)
     where jsonb_typeof(e.value) <> 'object'
        or (e.value->>'id') is null
        or (e.value->>'amount_kurus')::bigint is null
  ) then
    raise exception 'every item needs an id and an amount' using errcode = '22023';
  end if;
  select count(*), count(distinct (e.value->>'id')::uuid) into wanted, changed
    from jsonb_array_elements(p_items) as e(value);
  if wanted <> changed then
    raise exception 'an item is listed twice' using errcode = '22023';
  end if;

  update public.receipt_items i
     set amount_kurus = (e.value->>'amount_kurus')::bigint,
         name = case when e.value ? 'name'
                     then nullif(btrim(e.value->>'name'), '') else i.name end,
         brand = case when e.value ? 'brand'
                      then nullif(btrim(e.value->>'brand'), '') else i.brand end,
         quantity = case when e.value ? 'quantity'
                         then public.measure_value(e.value->'quantity') else i.quantity end,
         quantity_unit = case when e.value ? 'quantity'
                              then public.measure_unit(e.value->'quantity') else i.quantity_unit end,
         package_size = case when e.value ? 'package_size'
                             then public.measure_value(e.value->'package_size') else i.package_size end,
         package_size_unit = case when e.value ? 'package_size'
                                  then public.measure_unit(e.value->'package_size') else i.package_size_unit end,
         package_count = case when e.value ? 'package_count'
                              then (e.value->>'package_count')::integer else i.package_count end,
         category = case when e.value ? 'category'
                         then e.value->>'category' else i.category end,
         unsure = case when e.value ? 'unsure'
                       then coalesce(array(
                         select jsonb_array_elements_text(e.value->'unsure')), '{}')
                       else i.unsure end
    from jsonb_array_elements(p_items) as e(value)
   where i.id = (e.value->>'id')::uuid and i.receipt_id = draft.id;
  get diagnostics changed = row_count;
  if changed <> wanted then
    -- Rolls back the whole call: nothing is saved.
    raise exception 'an item is not on this receipt' using errcode = '22023';
  end if;

  update public.receipts r
     set store_name = case when p_receipt ? 'store_name'
                           then nullif(btrim(p_receipt->>'store_name'), '') else r.store_name end,
         purchased_on = case when p_receipt ? 'purchased_on'
                             then (p_receipt->>'purchased_on')::date else r.purchased_on end,
         total_kurus = case when p_receipt ? 'total_kurus'
                            then (p_receipt->>'total_kurus')::bigint else r.total_kurus end,
         unsure = case when p_receipt ? 'unsure'
                       then coalesce(array(
                         select jsonb_array_elements_text(p_receipt->'unsure')), '{}')
                       else r.unsure end
   where r.id = draft.id;

  update public.receipts r
     set status = 'saved',
         saved_at = now(),
         total_kurus = coalesce(r.total_kurus,
                                (select coalesce(sum(i.amount_kurus), 0)
                                   from public.receipt_items i
                                  where i.receipt_id = draft.id))
   where r.id = draft.id
  returning r.* into draft;
  if draft.total_kurus < 0 then
    raise exception 'a total cannot be negative' using errcode = '22023';
  end if;
  return next draft;
end;
$$;

revoke execute on function public.measure_value(jsonb) from public, anon;
revoke execute on function public.measure_unit(jsonb) from public, anon;
revoke execute on function public.record_extraction(uuid, text, jsonb) from public, anon;
revoke execute on function public.save_receipt(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.measure_value(jsonb) to authenticated;
grant execute on function public.measure_unit(jsonb) to authenticated;
grant execute on function public.record_extraction(uuid, text, jsonb) to authenticated;
grant execute on function public.save_receipt(uuid, jsonb, jsonb) to authenticated;
