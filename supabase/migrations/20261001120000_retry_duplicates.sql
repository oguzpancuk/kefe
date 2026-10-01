-- ROADMAP v1 2: retry and the duplicate-receipt warning (PRD #4, #6).
-- `create_receipt` makes the receipt for a draft's idempotency key, or
-- answers the one already there, so a send repeated after the network
-- dropped ends in one receipt. Receipts keep the SHA-256 of their photo,
-- and `save_receipt` refuses, with a warning naming the saved receipt,
-- a draft whose photo, or whose store, date and total, match a receipt
-- already saved, unless the person said "Yine de kaydet". Nothing is
-- ever deleted by the check.
-- Reversible in one commit: drop `create_receipt` and the new
-- `save_receipt(uuid, jsonb, jsonb, boolean)`, recreate
-- `save_receipt(uuid, jsonb, jsonb)` from 20261001080000, drop the index
-- and the column.

alter table public.receipts
  -- Hex SHA-256 of the photo as sent; the app computes it.
  add column image_sha256 text
    constraint receipts_image_sha256_hex check (image_sha256 ~ '^[0-9a-f]{64}$');

create index receipts_user_image_sha256_idx
  on public.receipts (user_id, image_sha256)
  where status = 'saved';

-- Creates the caller's receipt for `p_idempotency_key`, or finds the one
-- already made for it; answers that receipt either way. The key decides,
-- not `p_id`: a repeated send gets back the first receipt and its state
-- (a ready draft need not be read again). Security invoker: RLS and the
-- image-folder check apply as for a plain insert.
create function public.create_receipt(
  p_id uuid,
  p_idempotency_key uuid,
  p_image_path text,
  p_image_sha256 text default null
) returns setof public.receipts
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.receipts (id, idempotency_key, image_path, image_sha256)
  values (p_id, p_idempotency_key, p_image_path, p_image_sha256)
  on conflict (user_id, idempotency_key) do nothing;
  return query
    select * from public.receipts r
     where r.user_id = (select auth.uid())
       and r.idempotency_key = p_idempotency_key;
end;
$$;

-- As in 20261001080000, plus `p_allow_duplicate`. Before a draft becomes
-- saved, its photo hash and its final store, date and total are compared
-- with the caller's saved receipts; on a match the call fails with HTTP
-- 409, code `KF001` and, in `details`, the matching receipt as JSON
-- (`reason` 'image' or 'content', `receipt_id`, `store_name`,
-- `purchased_on`, `total_kurus`). The failure rolls back the whole call:
-- the draft stays a draft with what was read, nothing is deleted.
drop function public.save_receipt(uuid, jsonb, jsonb);

create function public.save_receipt(
  p_idempotency_key uuid,
  p_items jsonb default '[]'::jsonb,
  p_receipt jsonb default '{}'::jsonb,
  p_allow_duplicate boolean default false
) returns setof public.receipts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  draft public.receipts;
  match public.receipts;
  final_total bigint;
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
   where r.id = draft.id
  returning r.* into draft;

  final_total := coalesce(draft.total_kurus,
                          (select coalesce(sum(i.amount_kurus), 0)
                             from public.receipt_items i
                            where i.receipt_id = draft.id));
  if final_total < 0 then
    raise exception 'a total cannot be negative' using errcode = '22023';
  end if;

  if not p_allow_duplicate then
    -- One save of this person at a time, so two copies of one receipt
    -- saved at the same moment cannot both pass the check.
    perform pg_advisory_xact_lock(hashtextextended(draft.user_id::text, 0));
    select * into match
      from public.receipts r
     where r.user_id = draft.user_id
       and r.status = 'saved'
       and r.id <> draft.id
       and ((draft.image_sha256 is not null
             and r.image_sha256 = draft.image_sha256)
            or (draft.store_name is not null
                and draft.purchased_on is not null
                and lower(btrim(r.store_name)) = lower(btrim(draft.store_name))
                and r.purchased_on = draft.purchased_on
                and r.total_kurus = final_total))
     order by coalesce(r.image_sha256 = draft.image_sha256, false) desc,
              r.saved_at desc
     limit 1;
    if found then
      -- PostgREST answers 'PGRST' errors with the status and body given.
      raise sqlstate 'PGRST' using
        message = json_build_object(
          'code', 'KF001',
          'message', 'this receipt may be saved already',
          'details', json_build_object(
            'reason', case when draft.image_sha256 is not null
                                and match.image_sha256 = draft.image_sha256
                           then 'image' else 'content' end,
            'receipt_id', match.id,
            'store_name', match.store_name,
            'purchased_on', match.purchased_on,
            'total_kurus', match.total_kurus)::text,
          'hint', null)::text,
        detail = json_build_object('status', 409, 'headers', json_build_object())::text;
    end if;
  end if;

  update public.receipts r
     set status = 'saved', saved_at = now(), total_kurus = final_total
   where r.id = draft.id
  returning r.* into draft;
  return next draft;
end;
$$;

revoke execute on function public.create_receipt(uuid, uuid, text, text) from public, anon;
revoke execute on function public.save_receipt(uuid, jsonb, jsonb, boolean) from public, anon;
grant execute on function public.create_receipt(uuid, uuid, text, text) to authenticated;
grant execute on function public.save_receipt(uuid, jsonb, jsonb, boolean) to authenticated;
