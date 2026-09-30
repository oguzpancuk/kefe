-- Walking skeleton 2: receipts, their items and the private image bucket.
-- Every row and object belongs to one user and only that user reaches it
-- (RLS). Anon reaches nothing: every policy is `to authenticated`.
-- Money is integer kuruş (bigint). Reversible by dropping the two tables,
-- the bucket's policies and the bucket.

create table public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid()
    references auth.users (id) on delete cascade,
  -- Internal lifecycle, never shown by name (PRD #4). A draft is
  -- `needs_review`; only `saved` counts in totals.
  status text not null default 'uploading'
    constraint receipts_status_known
      check (status in ('uploading', 'queued', 'processing', 'needs_review', 'saved', 'failed')),
  total_kurus bigint,
  -- One per draft, chosen by the client, so a retried upload or save
  -- finds the same receipt instead of making a second one.
  idempotency_key uuid not null,
  -- Object name in the `receipts` bucket; always under the owner's folder.
  image_path text
    constraint receipts_image_in_owner_folder
      check (image_path is null or split_part(image_path, '/', 1) = user_id::text),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create table public.receipt_items (
  id uuid primary key default gen_random_uuid(),
  receipt_id uuid not null references public.receipts (id) on delete cascade,
  -- The line as read from the paper, kept next to the edited values.
  raw_text text not null,
  name text,
  amount_kurus bigint,
  created_at timestamptz not null default now()
);

create index receipt_items_receipt_id_idx on public.receipt_items (receipt_id);

alter table public.receipts enable row level security;
alter table public.receipt_items enable row level security;

-- `(select auth.uid())` is evaluated once per statement, not per row.
create policy "receipts: owner reads" on public.receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy "receipts: owner inserts" on public.receipts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "receipts: owner updates" on public.receipts
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy "receipts: owner deletes" on public.receipts
  for delete to authenticated using (user_id = (select auth.uid()));

-- An item belongs to whoever owns its receipt.
create policy "receipt_items: owner reads" on public.receipt_items
  for select to authenticated using (
    exists (select 1 from public.receipts r
            where r.id = receipt_id and r.user_id = (select auth.uid())));
create policy "receipt_items: owner inserts" on public.receipt_items
  for insert to authenticated with check (
    exists (select 1 from public.receipts r
            where r.id = receipt_id and r.user_id = (select auth.uid())));
create policy "receipt_items: owner updates" on public.receipt_items
  for update to authenticated
  using (
    exists (select 1 from public.receipts r
            where r.id = receipt_id and r.user_id = (select auth.uid())))
  with check (
    exists (select 1 from public.receipts r
            where r.id = receipt_id and r.user_id = (select auth.uid())));
create policy "receipt_items: owner deletes" on public.receipt_items
  for delete to authenticated using (
    exists (select 1 from public.receipts r
            where r.id = receipt_id and r.user_id = (select auth.uid())));

-- Private bucket: no public URLs; objects live under `<user id>/...`.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 10485760,
        array['image/jpeg', 'image/png', 'image/heic', 'image/webp']);

create policy "receipts bucket: owner reads" on storage.objects
  for select to authenticated using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts bucket: owner uploads" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts bucket: owner replaces" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "receipts bucket: owner deletes" on storage.objects
  for delete to authenticated using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = (select auth.uid())::text);
