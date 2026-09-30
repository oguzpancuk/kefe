-- Walking skeleton 5: saving a checked draft. `save_receipt` turns the
-- caller's draft into a saved receipt, applying the amounts the person
-- corrected, and is idempotent on the draft's idempotency key: a second
-- call (a double tap, a retried request) returns the same saved receipt
-- and changes nothing. Only saved receipts count in totals.
-- Reversible by dropping the function, the constraint and the column.

alter table public.receipts
  -- When the person saved it; the month a receipt without a readable
  -- date is counted in.
  add column saved_at timestamptz,
  add constraint receipts_saved_is_complete
    check (status <> 'saved' or (saved_at is not null and total_kurus is not null));

-- `p_items` is [{ "id": <item id>, "amount_kurus": <integer> }, ...]: the
-- amounts the person changed on the check screen, nothing else. The saved
-- total is the sum of the checked items. Security invoker: RLS decides
-- whose receipt the key finds, so another user's key finds nothing.
create function public.save_receipt(
  p_idempotency_key uuid,
  p_items jsonb default '[]'::jsonb
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

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'p_items must be an array' using errcode = '22023';
  end if;
  -- An amount that is not a whole number (12.5) fails the bigint cast.
  if exists (
    select 1 from jsonb_to_recordset(p_items) as e(id uuid, amount_kurus bigint)
     where e.id is null or e.amount_kurus is null
  ) then
    raise exception 'every item needs an id and an amount' using errcode = '22023';
  end if;
  select count(*), count(distinct e.id) into wanted, changed
    from jsonb_to_recordset(p_items) as e(id uuid, amount_kurus bigint);
  if wanted <> changed then
    raise exception 'an item is listed twice' using errcode = '22023';
  end if;

  update public.receipt_items i
     set amount_kurus = e.amount_kurus
    from jsonb_to_recordset(p_items) as e(id uuid, amount_kurus bigint)
   where i.id = e.id and i.receipt_id = draft.id;
  get diagnostics changed = row_count;
  if changed <> wanted then
    -- Rolls back the whole call: nothing is saved.
    raise exception 'an item is not on this receipt' using errcode = '22023';
  end if;

  update public.receipts r
     set status = 'saved',
         saved_at = now(),
         total_kurus = (select coalesce(sum(i.amount_kurus), 0)
                          from public.receipt_items i
                         where i.receipt_id = draft.id)
   where r.id = draft.id
  returning r.* into draft;
  return next draft;
end;
$$;

revoke execute on function public.save_receipt(uuid, jsonb) from public, anon;
grant execute on function public.save_receipt(uuid, jsonb) to authenticated;
